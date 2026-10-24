import "server-only";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/auth/session";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export type ProjectAccess = {
  project: {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    status: "ACTIVE" | "ARCHIVED";
    annotationMode: "SINGLE" | "MULTI";
    annotationsPerTask: number;
    createdAt: Date;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
  };
  roles: WorkspaceRole[];
  user: SessionUser;
};

export async function getProjectAccess(
  user: SessionUser,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAccess | null> {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: {
      workspace: {
        include: {
          projects: {
            where: { id: projectId },
          },
        },
      },
    },
  });

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.workspace.status !== "ACTIVE"
  ) {
    return null;
  }

  const project = membership.workspace.projects[0];
  if (!project) return null;

  return {
    project: {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      status: project.status,
      annotationMode: project.annotationMode,
      annotationsPerTask: project.annotationsPerTask,
      createdAt: project.createdAt,
    },
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      ownerId: membership.workspace.ownerId,
    },
    roles: membership.roles,
    user,
  };
}

export async function assertProjectMember(
  user: SessionUser,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAccess> {
  const access = await getProjectAccess(user, workspaceId, projectId);
  if (!access) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  return access;
}

export async function getTaskAccess(
  user: SessionUser,
  workspaceId: string,
  projectId: string,
  taskId: string,
) {
  const access = await getProjectAccess(user, workspaceId, projectId);
  if (!access) return null;

  const task = await prisma.annotationTask.findFirst({
    where: {
      id: taskId,
      projectId,
      project: { workspaceId },
    },
    include: {
      datasetRecord: true,
      datasetVersion: true,
      schemaVersion: true,
      assignments: {
        where: { status: "ACTIVE" },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      },
      annotations: {
        include: {
          annotator: { select: { id: true, displayName: true } },
          reviews: {
            orderBy: { createdAt: "desc" },
            include: { reviewer: { select: { id: true, displayName: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      adjudications: {
        orderBy: { createdAt: "desc" },
        include: { adjudicator: { select: { id: true, displayName: true } } },
      },
    },
  });

  if (!task) return null;
  return { ...access, task };
}

export type TaskAccess = NonNullable<Awaited<ReturnType<typeof getTaskAccess>>>;

export function activeAssignmentFor(task: TaskAccess, userId: string) {
  return task.task.assignments.find((assignment) => assignment.userId === userId);
}

export function annotationFor(task: TaskAccess, userId: string) {
  return task.task.annotations.find(
    (annotation) =>
      annotation.annotatorId === userId &&
      annotation.schemaVersionId === task.task.schemaVersionId,
  );
}
