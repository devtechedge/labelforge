import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound, validationFailed } from "@/lib/errors";
import { canAnnotate, isManager } from "@/auth/permissions";
import { validateAnswer } from "@/domain/answers";
import { parseAnnotationSchema } from "@/domain/schema";
import { recordAudit } from "@/services/audit";
import { annotationFor, getTaskAccess } from "@/repositories/access";
import type { SessionUser } from "@/auth/session";
import type { WorkspaceRole, TaskStatus } from "@/generated/prisma/enums";

const LOCKED_STATUSES: TaskStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "DISPUTED",
  "ADJUDICATION",
  "IN_REVIEW",
];

const NEXT_TASK_EXCLUDED: TaskStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "DISPUTED",
  "IN_REVIEW",
];

export async function listProjectTasks(input: {
  projectId: string;
  status?: string;
  assigneeId?: string;
  page: number;
  limit: number;
}) {
  const statusValues = input.status
    ? input.status
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is TaskStatus =>
          [
            "UNASSIGNED",
            "ASSIGNED",
            "IN_PROGRESS",
            "SUBMITTED",
            "IN_REVIEW",
            "ACCEPTED",
            "RETURNED_FOR_CORRECTION",
            "REJECTED",
            "DISPUTED",
            "ADJUDICATION",
            "RESOLVED",
          ].includes(value),
        )
    : undefined;

  const where: Prisma.AnnotationTaskWhereInput = {
    projectId: input.projectId,
    ...(statusValues && statusValues.length > 0
      ? { status: { in: statusValues } }
      : {}),
    ...(input.assigneeId
      ? {
          assignments: {
            some: { userId: input.assigneeId, status: "ACTIVE" },
          },
        }
      : {}),
  };

  const [tasks, total] = await Promise.all([
    prisma.annotationTask.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        datasetRecord: { select: { sourceId: true, sourceOrder: true, data: true } },
        schemaVersion: { select: { versionNumber: true, schemaJson: true } },
        assignments: {
          where: { status: "ACTIVE" },
          include: { user: { select: { id: true, displayName: true, email: true } } },
        },
        annotations: {
          select: {
            id: true,
            annotatorId: true,
            status: true,
            revision: true,
            updatedAt: true,
            submittedAt: true,
          },
        },
        _count: { select: { adjudications: true } },
      },
    }),
    prisma.annotationTask.count({ where }),
  ]);

  return { tasks, total };
}

export async function assignTasks(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  taskIds: string[];
  userIds: string[];
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can assign tasks.");
  }

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) throw notFound("Project not found.");
  if (project.status !== "ACTIVE") throw conflict("Restore this project first.");
  if (project.annotationMode === "SINGLE" && input.userIds.length !== 1) {
    throw conflict("Single-annotator projects accept one assignee per task.");
  }

  const memberships = await prisma.membership.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: { in: input.userIds },
      status: "ACTIVE",
    },
    include: { user: { select: { displayName: true } } },
  });
  if (memberships.length !== input.userIds.length) {
    throw validationFailed("One or more assignees are not active workspace members.");
  }
  for (const membership of memberships) {
    if (!canAnnotate(membership.roles)) {
      throw conflict(
        `${membership.user.displayName} does not hold the Annotator role.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;

    const tasks = await tx.annotationTask.findMany({
      where: { id: { in: input.taskIds }, projectId: input.projectId },
      include: {
        assignments: { where: { status: "ACTIVE" } },
        annotations: { select: { status: true } },
      },
    });
    if (tasks.length !== input.taskIds.length) {
      throw notFound("One or more tasks were not found in this project.");
    }

    for (const task of tasks) {
      if (
        ["ACCEPTED", "REJECTED", "RESOLVED", "DISPUTED", "ADJUDICATION", "IN_REVIEW"].includes(
          task.status,
        )
      ) {
        throw conflict("Tasks under review or resolved cannot be assigned.");
      }
      if (project.annotationMode === "SINGLE") {
        if (task.assignments.length > 0) {
          throw conflict("A task already has an active annotator. Reassign it instead.");
        }
      } else {
        const activeUserIds = new Set(task.assignments.map((item) => item.userId));
        if (activeUserIds.size + input.userIds.length > task.requiredAnnotations) {
          throw conflict(
            `This task already has ${activeUserIds.size} of ${task.requiredAnnotations} annotators.`,
          );
        }
        if (input.userIds.some((userId) => activeUserIds.has(userId))) {
          throw conflict("That annotator is already assigned to one of these tasks.");
        }
      }
    }

    for (const task of tasks) {
      await tx.taskAssignment.createMany({
        data: input.userIds.map((userId) => ({
          taskId: task.id,
          userId,
          assignedById: input.user.id,
          exclusiveSlot: project.annotationMode === "SINGLE" ? task.id : null,
        })),
      });
      await tx.annotationTask.update({
        where: { id: task.id },
        data: {
          status: task.status === "UNASSIGNED" ? "ASSIGNED" : task.status,
          version: { increment: 1 },
        },
      });
    }

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "tasks.assigned",
      targetType: "AnnotationTask",
      targetId: input.projectId,
      metadata: {
        projectId: input.projectId,
        taskCount: tasks.length,
        assigneeCount: input.userIds.length,
      },
    });

    return { assignedTasks: tasks.length, assignments: tasks.length * input.userIds.length };
  });
}

export async function reassignTasks(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  taskIds: string[];
  userId: string;
  fromUserId?: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can reassign tasks.");
  }

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) throw notFound("Project not found.");

  const targetMembership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    include: { user: { select: { displayName: true } } },
  });
  if (
    !targetMembership ||
    targetMembership.status !== "ACTIVE" ||
    !canAnnotate(targetMembership.roles)
  ) {
    throw conflict("The new assignee must be an active member with the Annotator role.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;

    const tasks = await tx.annotationTask.findMany({
      where: { id: { in: input.taskIds }, projectId: input.projectId },
      include: {
        assignments: { where: { status: "ACTIVE" } },
        annotations: { select: { status: true } },
      },
    });
    if (tasks.length !== input.taskIds.length) {
      throw notFound("One or more tasks were not found in this project.");
    }

    let reassigned = 0;
    for (const task of tasks) {
      if (!["UNASSIGNED", "ASSIGNED", "IN_PROGRESS"].includes(task.status)) {
        throw conflict("Only unstarted or in-progress tasks can be reassigned.");
      }
      if (
        task.annotations.some((annotation) =>
          ["SUBMITTED", "ACCEPTED", "DISPUTED", "REJECTED"].includes(annotation.status),
        )
      ) {
        throw conflict(
          "This task has a submission or decision attached. Use the review workflow instead of reassigning.",
        );
      }
      if (task.assignments.some((assignment) => assignment.userId === input.userId)) {
        throw conflict("The chosen annotator is already assigned to one of these tasks.");
      }

      if (project.annotationMode === "SINGLE") {
        await tx.taskAssignment.updateMany({
          where: { taskId: task.id, status: "ACTIVE" },
          data: {
            status: "RELEASED",
            endedAt: new Date(),
            exclusiveSlot: null,
          },
        });
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            userId: input.userId,
            assignedById: input.user.id,
            exclusiveSlot: task.id,
          },
        });
      } else {
        const active = input.fromUserId
          ? task.assignments.filter((assignment) => assignment.userId === input.fromUserId)
          : task.assignments;
        if (active.length !== 1) {
          throw conflict(
            "Choose exactly one active annotator to replace on this multi-annotator task.",
          );
        }
        const assignment = active[0];
        if (!assignment) throw conflict("There is no active assignment to reassign.");
        await tx.taskAssignment.update({
          where: { id: assignment.id },
          data: { status: "RELEASED", endedAt: new Date(), exclusiveSlot: null },
        });
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            userId: input.userId,
            assignedById: input.user.id,
            exclusiveSlot: null,
          },
        });
      }

      await tx.annotationTask.update({
        where: { id: task.id },
        data: { status: "ASSIGNED", version: { increment: 1 } },
      });
      reassigned += 1;
    }

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "tasks.reassigned",
      targetType: "AnnotationTask",
      targetId: input.projectId,
      metadata: {
        projectId: input.projectId,
        taskCount: reassigned,
        newAssigneeId: input.userId,
      },
    });

    return { reassigned };
  });
}

export async function getAnnotateContext(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  taskId: string;
}) {
  const access = await getTaskAccess(
    input.user,
    input.workspaceId,
    input.projectId,
    input.taskId,
  );
  if (!access) throw notFound("Task not found.");
  if (!canAnnotate(access.roles)) {
    throw forbidden("Only annotators can open the annotation workbench.");
  }
  const assignment = access.task.assignments.find(
    (item) => item.userId === input.user.id,
  );
  if (!assignment) {
    throw forbidden("This task is not assigned to you.");
  }
  if (access.project.status !== "ACTIVE") {
    throw conflict("This project is archived.");
  }

  const schemaResult = parseAnnotationSchema(access.task.schemaVersion.schemaJson);
  if (!schemaResult.ok) {
    throw conflict("The pinned schema version is not readable. Ask a manager for help.");
  }
  const annotation = annotationFor(access, input.user.id);

  const queue = await prisma.annotationTask.findMany({
    where: {
      projectId: input.projectId,
      assignments: { some: { userId: input.user.id, status: "ACTIVE" } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 60,
    select: {
      id: true,
      status: true,
      datasetRecord: { select: { sourceId: true, sourceOrder: true } },
      annotations: {
        where: { annotatorId: input.user.id },
        select: { status: true, revision: true },
      },
    },
  });

  return {
    access,
    task: access.task,
    schema: schemaResult.schema,
    annotation,
    queue,
  };
}

export async function saveDraft(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  taskId: string;
  answer: Record<string, unknown>;
  expectedRevision: number;
}) {
  const access = await getTaskAccess(
    input.user,
    input.workspaceId,
    input.projectId,
    input.taskId,
  );
  if (!access) throw notFound("Task not found.");
  if (!canAnnotate(access.roles)) throw forbidden("Only annotators can save work.");
  if (access.project.status !== "ACTIVE") throw conflict("This project is archived.");

  const activeAssignment = access.task.assignments.find(
    (assignment) => assignment.userId === input.user.id,
  );
  if (!activeAssignment) throw forbidden("This task is not assigned to you.");
  if (LOCKED_STATUSES.includes(access.task.status)) {
    throw conflict("This task is no longer editable in the workbench.");
  }

  const schemaResult = parseAnnotationSchema(access.task.schemaVersion.schemaJson);
  if (!schemaResult.ok) throw conflict("The pinned schema version is not readable.");

  const record = access.task.datasetRecord.data as Record<string, unknown>;
  const validation = validateAnswer(schemaResult.schema, input.answer, record);
  if (!validation.ok) {
    throw validationFailed("Some answers do not match the schema.", {
      issues: validation.issues,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AnnotationTask" WHERE id = ${input.taskId} FOR UPDATE`;
    const lockedTask = await tx.annotationTask.findUniqueOrThrow({
      where: { id: input.taskId },
    });
    if (LOCKED_STATUSES.includes(lockedTask.status)) {
      throw conflict("This task is locked by the review workflow.");
    }
    if (lockedTask.schemaVersionId !== access.task.schemaVersionId) {
      throw conflict("This task moved to another schema version. Reload the workbench.");
    }
    const stillAssigned = await tx.taskAssignment.findFirst({
      where: { taskId: input.taskId, userId: input.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!stillAssigned) throw forbidden("This task is no longer assigned to you.");

    let annotation = await tx.annotation.findUnique({
      where: {
        taskId_annotatorId_schemaVersionId: {
          taskId: input.taskId,
          annotatorId: input.user.id,
          schemaVersionId: access.task.schemaVersionId,
        },
      },
    });

    if (!annotation) {
      if (input.expectedRevision !== 0) {
        throw conflict("This annotation changed elsewhere.", {
          reason: "STALE_REVISION",
          currentRevision: 0,
        });
      }
      annotation = await tx.annotation.create({
        data: {
          taskId: input.taskId,
          annotatorId: input.user.id,
          schemaVersionId: access.task.schemaVersionId,
          answer: validation.answer as Prisma.InputJsonValue,
          revision: 1,
          status: "DRAFT",
          lastSavedAt: new Date(),
        },
      });
    } else {
      if (!["DRAFT", "RETURNED_FOR_CORRECTION"].includes(annotation.status)) {
        throw conflict("This annotation has been submitted and cannot be overwritten.", {
          currentStatus: annotation.status,
        });
      }
      if (annotation.revision !== input.expectedRevision) {
        throw conflict("This annotation changed elsewhere. Reload before saving.", {
          reason: "STALE_REVISION",
          currentRevision: annotation.revision,
          currentStatus: annotation.status,
          lastSavedAt: annotation.lastSavedAt,
        });
      }
      const updated = await tx.annotation.updateMany({
        where: {
          id: annotation.id,
          revision: input.expectedRevision,
          status: { in: ["DRAFT", "RETURNED_FOR_CORRECTION"] },
        },
        data: {
          answer: validation.answer as Prisma.InputJsonValue,
          revision: { increment: 1 },
          lastSavedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw conflict("This annotation changed while saving. Reload before trying again.", {
          reason: "STALE_REVISION",
        });
      }
      annotation = await tx.annotation.findUniqueOrThrow({ where: { id: annotation.id } });
    }

    const task = await tx.annotationTask.update({
      where: { id: input.taskId },
      data: { status: "IN_PROGRESS", version: { increment: 1 } },
    });

    return {
      revision: annotation.revision,
      savedAt: annotation.lastSavedAt,
      status: annotation.status,
      taskVersion: task.version,
      schemaVersionId: access.task.schemaVersionId,
    };
  });

  return result;
}

export async function submitAnnotation(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  taskId: string;
  expectedRevision: number;
  submissionKey: string;
}) {
  const access = await getTaskAccess(
    input.user,
    input.workspaceId,
    input.projectId,
    input.taskId,
  );
  if (!access) throw notFound("Task not found.");
  if (!canAnnotate(access.roles)) throw forbidden("Only annotators can submit work.");
  if (access.project.status !== "ACTIVE") throw conflict("This project is archived.");

  const assignment = access.task.assignments.find(
    (item) => item.userId === input.user.id,
  );
  if (!assignment) throw forbidden("This task is not assigned to you.");

  const schemaResult = parseAnnotationSchema(access.task.schemaVersion.schemaJson);
  if (!schemaResult.ok) throw conflict("The pinned schema version is not readable.");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AnnotationTask" WHERE id = ${input.taskId} FOR UPDATE`;
    const lockedTask = await tx.annotationTask.findUniqueOrThrow({
      where: { id: input.taskId },
    });
    if (lockedTask.schemaVersionId !== access.task.schemaVersionId) {
      throw conflict("This task moved to another schema version. Reload before submitting.");
    }
    if (["ACCEPTED", "REJECTED", "RESOLVED", "DISPUTED", "ADJUDICATION"].includes(lockedTask.status)) {
      throw conflict("This task is already moving through adjudication or release.");
    }
    const stillAssigned = await tx.taskAssignment.findFirst({
      where: { taskId: input.taskId, userId: input.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!stillAssigned) throw forbidden("This task is no longer assigned to you.");

    const annotation = await tx.annotation.findUnique({
      where: {
        taskId_annotatorId_schemaVersionId: {
          taskId: input.taskId,
          annotatorId: input.user.id,
          schemaVersionId: access.task.schemaVersionId,
        },
      },
    });
    if (!annotation) throw conflict("Save a draft before submitting.");

    if (annotation.submissionKey === input.submissionKey) {
      return {
        idempotent: true,
        revision: annotation.revision,
        status: annotation.status,
        taskStatus: access.task.status,
        submittedAt: annotation.submittedAt,
      };
    }
    if (!["DRAFT", "RETURNED_FOR_CORRECTION"].includes(annotation.status)) {
      throw conflict("This annotation has already been submitted.", {
        currentStatus: annotation.status,
        currentRevision: annotation.revision,
      });
    }
    if (annotation.revision !== input.expectedRevision) {
      throw conflict("This annotation changed while you were submitting. Reload first.", {
        reason: "STALE_REVISION",
        currentRevision: annotation.revision,
        currentStatus: annotation.status,
      });
    }

    const record = access.task.datasetRecord.data as Record<string, unknown>;
    const validation = validateAnswer(schemaResult.schema, annotation.answer, record);
    if (!validation.ok) {
      throw validationFailed("Fix the schema errors before submitting.", {
        issues: validation.issues,
      });
    }
    if (validation.missingRequired.length > 0) {
      throw new AppError(
        "ANSWER_INCOMPLETE",
        "Complete the required answers before submitting.",
        422,
        { missing: validation.missingRequired },
      );
    }

    const updated = await tx.annotation.updateMany({
      where: {
        id: annotation.id,
        revision: input.expectedRevision,
        status: { in: ["DRAFT", "RETURNED_FOR_CORRECTION"] },
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        lastSavedAt: new Date(),
        revision: { increment: 1 },
        submissionKey: input.submissionKey,
      },
    });
    if (updated.count === 0) {
      throw conflict("This annotation changed while submitting. Reload before trying again.", {
        reason: "STALE_REVISION",
      });
    }

    const submittedCount = await tx.annotation.count({
      where: {
        taskId: input.taskId,
        schemaVersionId: access.task.schemaVersionId,
        status: { in: ["SUBMITTED", "ACCEPTED", "DISPUTED"] },
      },
    });
    const taskStatus =
      submittedCount >= access.task.requiredAnnotations ? "SUBMITTED" : "IN_PROGRESS";

    const task = await tx.annotationTask.update({
      where: { id: input.taskId },
      data: { status: taskStatus, version: { increment: 1 } },
    });

    const fresh = await tx.annotation.findUniqueOrThrow({ where: { id: annotation.id } });

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "annotation.submitted",
      targetType: "Annotation",
      targetId: annotation.id,
      metadata: {
        projectId: input.projectId,
        taskId: input.taskId,
        revision: fresh.revision,
      },
    });

    return {
      idempotent: false,
      revision: fresh.revision,
      status: fresh.status,
      taskStatus: task.status,
      submittedAt: fresh.submittedAt,
    };
  });
}

export async function getNextTask(input: {
  user: SessionUser;
  workspaceId?: string;
  projectId?: string;
}) {
  const task = await prisma.annotationTask.findFirst({
    where: {
      status: { notIn: NEXT_TASK_EXCLUDED },
      assignments: { some: { userId: input.user.id, status: "ACTIVE" } },
      project: {
        status: "ACTIVE",
        ...(input.projectId ? { id: input.projectId } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        workspace: { memberships: { some: { userId: input.user.id, status: "ACTIVE" } } },
      },
      annotations: {
        none: {
          annotatorId: input.user.id,
          status: { in: ["SUBMITTED", "ACCEPTED", "DISPUTED"] },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      project: { select: { id: true, workspaceId: true, name: true } },
      datasetRecord: { select: { sourceId: true } },
    },
  });

  return task;
}

export async function listMyQueue(input: {
  user: SessionUser;
  projectId: string;
}) {
  return prisma.annotationTask.findMany({
    where: {
      projectId: input.projectId,
      assignments: { some: { userId: input.user.id, status: "ACTIVE" } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      datasetRecord: { select: { sourceId: true, sourceOrder: true } },
      annotations: {
        where: { annotatorId: input.user.id },
        select: { status: true, revision: true, lastSavedAt: true },
      },
    },
  });
}
