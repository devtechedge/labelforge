import "server-only";

import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requireApiUser, type SessionUser } from "@/auth/session";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export type ProjectApiAccess = {
  user: SessionUser;
  project: {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    status: "ACTIVE" | "ARCHIVED";
    annotationMode: "SINGLE" | "MULTI";
    annotationsPerTask: number;
    datasetId: string | null;
    workspaceName: string;
  };
  roles: WorkspaceRole[];
};

export async function requireProjectApi(projectId: string): Promise<ProjectApiAccess> {
  const user = await requireApiUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      dataset: { select: { id: true } },
      workspace: {
        select: {
          id: true,
          name: true,
          status: true,
          memberships: {
            where: { userId: user.id },
            select: { roles: true, status: true },
          },
        },
      },
    },
  });
  const membership = project?.workspace.memberships[0];
  if (
    !project ||
    !membership ||
    membership.status !== "ACTIVE" ||
    project.workspace.status !== "ACTIVE"
  ) {
    throw notFound("Project not found.");
  }

  return {
    user,
    project: {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      status: project.status,
      annotationMode: project.annotationMode,
      annotationsPerTask: project.annotationsPerTask,
      datasetId: project.dataset?.id ?? null,
      workspaceName: project.workspace.name,
    },
    roles: membership.roles,
  };
}

export type TaskApiAccess = {
  user: SessionUser;
  task: {
    id: string;
    projectId: string;
    workspaceId: string;
    schemaVersionId: string;
    requiredAnnotations: number;
    version: number;
    status: string;
  };
  roles: WorkspaceRole[];
};

export async function requireTaskApi(taskId: string): Promise<TaskApiAccess> {
  const user = await requireApiUser();
  const task = await prisma.annotationTask.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          workspace: {
            include: {
              memberships: {
                where: { userId: user.id },
                select: { roles: true, status: true },
              },
            },
          },
        },
      },
    },
  });
  const membership = task?.project.workspace.memberships[0];
  if (
    !task ||
    !membership ||
    membership.status !== "ACTIVE" ||
    task.project.workspace.status !== "ACTIVE"
  ) {
    throw notFound("Task not found.");
  }

  return {
    user,
    task: {
      id: task.id,
      projectId: task.projectId,
      workspaceId: task.project.workspaceId,
      schemaVersionId: task.schemaVersionId,
      requiredAnnotations: task.requiredAnnotations,
      version: task.version,
      status: task.status,
    },
    roles: membership.roles,
  };
}

export async function requireAnnotationApi(annotationId: string) {
  const user = await requireApiUser();
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: {
      task: {
        include: {
          project: {
            include: {
              workspace: {
                include: {
                  memberships: {
                    where: { userId: user.id },
                    select: { roles: true, status: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const membership = annotation?.task.project.workspace.memberships[0];
  if (
    !annotation ||
    !membership ||
    membership.status !== "ACTIVE" ||
    annotation.task.project.workspace.status !== "ACTIVE"
  ) {
    throw notFound("Annotation not found.");
  }
  return {
    user,
    annotation,
    projectId: annotation.task.projectId,
    workspaceId: annotation.task.project.workspaceId,
    roles: membership.roles,
  };
}

export async function requireBatchApi(batchId: string) {
  const user = await requireApiUser();
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: {
      workspace: {
        include: {
          memberships: {
            where: { userId: user.id },
            select: { roles: true, status: true },
          },
        },
      },
    },
  });
  const membership = batch?.workspace.memberships[0];
  if (
    !batch ||
    !membership ||
    membership.status !== "ACTIVE" ||
    batch.workspace.status !== "ACTIVE"
  ) {
    throw notFound("Import batch not found.");
  }
  return { user, batch, workspaceId: batch.workspaceId, roles: membership.roles };
}
