import "server-only";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { isManager, isOwner } from "@/auth/permissions";
import { LIMITS } from "@/domain/limits";
import { recordAudit } from "@/services/audit";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";

export async function createProject(input: {
  user: SessionUser;
  workspaceId: string;
  roles: WorkspaceRole[];
  name: string;
  description: string;
  annotationMode: "SINGLE" | "MULTI";
  annotationsPerTask: number;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can create projects.");
  }
  if (input.annotationMode === "MULTI" && input.annotationsPerTask < 2) {
    throw conflict("Multi-annotator projects need at least two annotations per task.");
  }

  const projectCount = await prisma.project.count({
    where: { workspaceId: input.workspaceId },
  });
  if (projectCount >= LIMITS.projectsPerWorkspace) {
    throw conflict(
      `This workspace has reached its ${LIMITS.projectsPerWorkspace}-project limit.`,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          annotationMode: input.annotationMode,
          annotationsPerTask:
            input.annotationMode === "SINGLE" ? 1 : input.annotationsPerTask,
          createdById: input.user.id,
          dataset: {
            create: { name: `${input.name} dataset` },
          },
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorId: input.user.id,
        action: "project.created",
        targetType: "Project",
        targetId: project.id,
        metadata: { name: project.name, mode: project.annotationMode },
      });
      return project;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw conflict("A project with that name already exists in this workspace.");
    }
    throw error;
  }
}

export async function getProjectOverview(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      dataset: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 10,
            include: { _count: { select: { records: true, tasks: true } } },
          },
          _count: { select: { versions: true } },
        },
      },
      schemaVersions: {
        orderBy: { versionNumber: "desc" },
        include: {
          createdBy: { select: { displayName: true } },
          _count: { select: { tasks: true } },
        },
      },
      importBatches: {
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { createdBy: { select: { displayName: true } } },
      },
      releases: {
        orderBy: { versionNumber: "desc" },
        take: 5,
      },
      _count: {
        select: {
          tasks: true,
          schemaVersions: true,
          releases: true,
          importBatches: true,
        },
      },
    },
  });
  if (!project) return null;

  const statusGroups = await prisma.annotationTask.groupBy({
    by: ["status"],
    where: { projectId },
    _count: { _all: true },
  });
  const annotationGroups = await prisma.annotation.groupBy({
    by: ["status"],
    where: { task: { projectId } },
    _count: { _all: true },
  });
  const activeAssignees = await prisma.taskAssignment.findMany({
    where: {
      task: { projectId },
      status: "ACTIVE",
    },
    select: {
      userId: true,
      user: { select: { displayName: true } },
    },
  });
  const assigneeMap = new Map<string, { id: string; displayName: string; count: number }>();
  for (const assignment of activeAssignees) {
    const entry = assigneeMap.get(assignment.userId) ?? {
      id: assignment.userId,
      displayName: assignment.user.displayName,
      count: 0,
    };
    entry.count += 1;
    assigneeMap.set(assignment.userId, entry);
  }

  return {
    project,
    taskStatusCounts: Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    ),
    annotationStatusCounts: Object.fromEntries(
      annotationGroups.map((group) => [group.status, group._count._all]),
    ),
    activeAssignees: [...assigneeMap.values()].sort((a, b) => b.count - a.count),
  };
}

export async function updateProject(input: {
  projectId: string;
  workspaceId: string;
  roles: WorkspaceRole[];
  actorId: string;
  name: string;
  description: string;
  annotationMode: "SINGLE" | "MULTI";
  annotationsPerTask: number;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can update projects.");
  }
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
    include: { _count: { select: { tasks: true } } },
  });
  if (!project) throw notFound("Project not found.");

  if (
    (project.annotationMode !== input.annotationMode ||
      project.annotationsPerTask !== input.annotationsPerTask) &&
    project._count.tasks > 0
  ) {
    throw conflict(
      "Annotation mode is locked once tasks exist. Create a new project to change the policy.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        name: input.name,
        description: input.description,
        annotationMode: input.annotationMode,
        annotationsPerTask:
          input.annotationMode === "SINGLE" ? 1 : input.annotationsPerTask,
      },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "project.updated",
      targetType: "Project",
      targetId: project.id,
      metadata: { name: input.name, mode: input.annotationMode },
    });
  });
}

export async function setProjectArchived(input: {
  projectId: string;
  workspaceId: string;
  roles: WorkspaceRole[];
  actorId: string;
  archived: boolean;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can archive projects.");
  }
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) throw notFound("Project not found.");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: { status: input.archived ? "ARCHIVED" : "ACTIVE" },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.archived ? "project.archived" : "project.restored",
      targetType: "Project",
      targetId: project.id,
    });
  });
}

export async function deleteProject(input: {
  projectId: string;
  workspaceId: string;
  roles: WorkspaceRole[];
  actorId: string;
  confirmation: string;
}) {
  if (!isOwner(input.roles)) {
    throw forbidden("Only the workspace owner can permanently delete a project.");
  }
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) throw notFound("Project not found.");
  if (input.confirmation !== project.name) {
    throw conflict("Type the project name exactly to confirm permanent deletion.");
  }

  await prisma.$transaction(async (tx) => {
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "project.deleted",
      targetType: "Project",
      targetId: project.id,
      metadata: { name: project.name },
    });
    await tx.project.delete({ where: { id: project.id } });
  });
}
