import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, validationFailed } from "@/lib/errors";
import { canAdjudicate, canReview } from "@/auth/permissions";
import { deriveTaskStatus } from "@/domain/workflow";
import { parseAnnotationSchema } from "@/domain/schema";
import { validateAnswer } from "@/domain/answers";
import { recordAudit } from "@/services/audit";
import { getTaskAccess } from "@/repositories/access";
import type { SessionUser } from "@/auth/session";
import type {
  AnnotationStatus,
  ReviewDecision,
  WorkspaceRole,
} from "@/generated/prisma/enums";

export async function listReviewQueue(input: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.AnnotationTaskWhereInput = {
    projectId: input.projectId,
    status: { in: ["SUBMITTED", "IN_REVIEW", "RETURNED_FOR_CORRECTION"] },
    annotations: { some: { status: "SUBMITTED" } },
  };

  const [tasks, total] = await Promise.all([
    prisma.annotationTask.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        datasetRecord: { select: { sourceId: true, data: true } },
        schemaVersion: { select: { versionNumber: true, schemaJson: true } },
        annotations: {
          where: { status: { not: "DRAFT" } },
          orderBy: { createdAt: "asc" },
          include: {
            annotator: { select: { id: true, displayName: true } },
            reviews: {
              orderBy: { createdAt: "desc" },
              include: { reviewer: { select: { displayName: true } } },
            },
          },
        },
        _count: { select: { adjudications: true } },
      },
    }),
    prisma.annotationTask.count({ where }),
  ]);

  return { tasks, total };
}

export async function listAdjudicationQueue(input: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.AnnotationTaskWhereInput = {
    projectId: input.projectId,
    status: { in: ["DISPUTED", "ADJUDICATION"] },
  };
  const [tasks, total] = await Promise.all([
    prisma.annotationTask.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        datasetRecord: { select: { sourceId: true, data: true } },
        schemaVersion: { select: { versionNumber: true, schemaJson: true } },
        annotations: {
          where: { status: { not: "DRAFT" } },
          include: {
            annotator: { select: { displayName: true } },
            reviews: {
              orderBy: { createdAt: "desc" },
              include: { reviewer: { select: { displayName: true } } },
            },
          },
        },
      },
    }),
    prisma.annotationTask.count({ where }),
  ]);
  return { tasks, total };
}

async function loadAnnotationAccess(
  user: SessionUser,
  annotationId: string,
  requiredRoles: WorkspaceRole[] | "review" | "adjudicate",
) {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: {
      task: {
        include: {
          project: { include: { workspace: true } },
          adjudications: { select: { id: true } },
        },
      },
      annotator: { select: { id: true, displayName: true } },
    },
  });
  if (!annotation) throw notFound("Annotation not found.");

  const workspaceId = annotation.task.project.workspaceId;
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    annotation.task.project.workspace.status !== "ACTIVE"
  ) {
    throw notFound("Annotation not found.");
  }

  if (requiredRoles === "review" && !canReview(membership.roles)) {
    throw forbidden("Only reviewers and owners can decide reviews.");
  }
  if (requiredRoles === "adjudicate" && !canAdjudicate(membership.roles)) {
    throw forbidden("Only reviewers, managers, and owners can adjudicate.");
  }
  if (
    Array.isArray(requiredRoles) &&
    !requiredRoles.some((role) => membership.roles.includes(role))
  ) {
    throw forbidden("You do not have permission to do that.");
  }

  return { annotation, membership, workspaceId };
}

export async function beginReview(input: {
  user: SessionUser;
  annotationId: string;
}) {
  const { annotation, membership, workspaceId } = await loadAnnotationAccess(
    input.user,
    input.annotationId,
    "review",
  );
  if (annotation.status !== "SUBMITTED") {
    throw conflict("Only submitted annotations can enter review.");
  }
  if (annotation.task.status === "DISPUTED" || annotation.task.status === "ADJUDICATION") {
    throw conflict("This task is in adjudication.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.annotationTask.updateMany({
      where: {
        id: annotation.taskId,
        status: { in: ["SUBMITTED", "IN_REVIEW"] },
      },
      data: { status: "IN_REVIEW", version: { increment: 1 } },
    });
    if (updated.count > 0) {
      await recordAudit(tx, {
        workspaceId,
        actorId: input.user.id,
        action: "review.started",
        targetType: "AnnotationTask",
        targetId: annotation.taskId,
        metadata: { roles: membership.roles },
      });
    }
  });

  return { taskId: annotation.taskId, status: "IN_REVIEW" as const };
}

export async function reviewAnnotation(input: {
  user: SessionUser;
  annotationId: string;
  decision: ReviewDecision;
  feedback?: string;
  expectedRevision: number;
  idempotencyKey?: string;
}) {
  const { annotation, workspaceId } = await loadAnnotationAccess(
    input.user,
    input.annotationId,
    "review",
  );
  if (annotation.annotatorId === input.user.id) {
    throw conflict("You cannot review your own annotation.");
  }
  if (input.decision !== "PASS" && (!input.feedback || input.feedback.trim().length < 10)) {
    throw validationFailed("Write at least 10 characters of feedback for this decision.");
  }

  if (input.idempotencyKey) {
    const existing = await prisma.review.findUnique({
      where: { dedupeKey: input.idempotencyKey },
      include: { annotation: { select: { status: true, revision: true } } },
    });
    if (existing) {
      if (existing.annotationId !== input.annotationId) {
        throw conflict("That idempotency key was used for a different review.");
      }
      return {
        idempotent: true,
        reviewId: existing.id,
        annotationStatus: existing.annotation.status,
        annotationRevision: existing.annotation.revision,
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AnnotationTask" WHERE id = ${annotation.taskId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Annotation" WHERE id = ${input.annotationId} FOR UPDATE`;

    const current = await tx.annotation.findUnique({
      where: { id: input.annotationId },
      include: {
        task: {
          include: {
            annotations: { select: { status: true } },
            adjudications: { select: { id: true } },
          },
        },
      },
    });
    if (!current) throw notFound("Annotation not found.");
    if (current.annotatorId === input.user.id) {
      throw conflict("You cannot review your own annotation.");
    }
    if (
      ["DISPUTED", "ADJUDICATION", "RESOLVED", "ACCEPTED", "REJECTED"].includes(
        current.task.status,
      )
    ) {
      throw conflict("This task is no longer open for review decisions.");
    }
    if (current.status !== "SUBMITTED") {
      throw conflict("This annotation is not awaiting review.", {
        currentStatus: current.status,
      });
    }
    if (current.revision !== input.expectedRevision) {
      throw conflict("This annotation changed since you loaded it. Reload the review.", {
        reason: "STALE_REVISION",
        currentRevision: current.revision,
        currentStatus: current.status,
      });
    }

    const annotationStatus: AnnotationStatus =
      input.decision === "PASS"
        ? "ACCEPTED"
        : input.decision === "RETURN_FOR_CORRECTION"
          ? "RETURNED_FOR_CORRECTION"
          : input.decision === "REJECT"
            ? "REJECTED"
            : "DISPUTED";

    const updated = await tx.annotation.updateMany({
      where: {
        id: current.id,
        revision: input.expectedRevision,
        status: "SUBMITTED",
      },
      data: { status: annotationStatus },
    });
    if (updated.count === 0) {
      throw conflict("Another reviewer decided this annotation first.", {
        reason: "STALE_REVISION",
      });
    }

    const review = await tx.review.create({
      data: {
        annotationId: current.id,
        taskId: current.taskId,
        reviewerId: input.user.id,
        decision: input.decision,
        feedback: input.feedback?.trim() || null,
        observedRevision: input.expectedRevision,
        dedupeKey: input.idempotencyKey ?? null,
      },
    });

    if (input.decision === "REQUEST_ADJUDICATION") {
      const task = await tx.annotationTask.update({
        where: { id: current.taskId },
        data: { status: "DISPUTED", version: { increment: 1 } },
      });
      await recordAudit(tx, {
        workspaceId,
        actorId: input.user.id,
        action: "review.requested_adjudication",
        targetType: "AnnotationTask",
        targetId: current.taskId,
        metadata: { projectId: current.task.projectId, decision: input.decision },
      });
      return {
        idempotent: false,
        reviewId: review.id,
        annotationStatus,
        annotationRevision: current.revision,
        taskStatus: task.status,
      };
    }

    if (input.decision === "RETURN_FOR_CORRECTION") {
      const task = await tx.annotationTask.update({
        where: { id: current.taskId },
        data: { status: "RETURNED_FOR_CORRECTION", version: { increment: 1 } },
      });
      await recordAudit(tx, {
        workspaceId,
        actorId: input.user.id,
        action: "review.returned",
        targetType: "AnnotationTask",
        targetId: current.taskId,
        metadata: { projectId: current.task.projectId, decision: input.decision },
      });
      return {
        idempotent: false,
        reviewId: review.id,
        annotationStatus,
        annotationRevision: current.revision,
        taskStatus: task.status,
      };
    }

    const annotations = current.task.annotations.map((item) =>
      item.status === current.status ? { status: annotationStatus } : item,
    );
    const derived = deriveTaskStatus({
      annotations,
      requiredAnnotations: current.task.requiredAnnotations,
      hasAdjudication: current.task.adjudications.length > 0,
    });
    const task = await tx.annotationTask.update({
      where: { id: current.taskId },
      data: { status: derived, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      workspaceId,
      actorId: input.user.id,
      action: "review.decided",
      targetType: "AnnotationTask",
      targetId: current.taskId,
      metadata: {
        projectId: current.task.projectId,
        decision: input.decision,
        resultingStatus: task.status,
      },
    });

    return {
      idempotent: false,
      reviewId: review.id,
      annotationStatus,
      annotationRevision: current.revision,
      taskStatus: task.status,
    };
  });
}

export async function beginAdjudication(input: {
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
  if (!canAdjudicate(access.roles)) {
    throw forbidden("Only reviewers, managers, and owners can adjudicate.");
  }
  if (access.task.status === "ADJUDICATION") {
    return { taskId: input.taskId, status: "ADJUDICATION" as const, version: access.task.version };
  }
  if (access.task.status !== "DISPUTED") {
    throw conflict("Only disputed tasks can enter adjudication.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.annotationTask.updateMany({
      where: { id: input.taskId, status: "DISPUTED" },
      data: { status: "ADJUDICATION", version: { increment: 1 } },
    });
    if (updated.count === 0) throw conflict("This task changed before adjudication began.");
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "adjudication.started",
      targetType: "AnnotationTask",
      targetId: input.taskId,
      metadata: { projectId: input.projectId },
    });
    const task = await tx.annotationTask.findUniqueOrThrow({ where: { id: input.taskId } });
    return { taskId: task.id, status: "ADJUDICATION" as const, version: task.version };
  });
}

export async function adjudicateTask(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  taskId: string;
  finalAnswer: Record<string, unknown>;
  rationale: string;
  expectedTaskVersion: number;
  chosenAnnotationId?: string | null;
}) {
  const access = await getTaskAccess(
    input.user,
    input.workspaceId,
    input.projectId,
    input.taskId,
  );
  if (!access) throw notFound("Task not found.");
  if (!canAdjudicate(access.roles)) {
    throw forbidden("Only reviewers, managers, and owners can adjudicate.");
  }
  if (access.project.status !== "ACTIVE") throw conflict("This project is archived.");
  if (!["DISPUTED", "ADJUDICATION"].includes(access.task.status)) {
    throw conflict("This task is not disputed.");
  }
  if (access.task.annotations.some((item) => item.annotatorId === input.user.id)) {
    throw conflict("You annotated this task, so you cannot adjudicate it.");
  }

  const schemaResult = parseAnnotationSchema(access.task.schemaVersion.schemaJson);
  if (!schemaResult.ok) throw conflict("The pinned schema version is not readable.");
  const record = access.task.datasetRecord.data as Record<string, unknown>;
  const validation = validateAnswer(schemaResult.schema, input.finalAnswer, record);
  if (!validation.ok) {
    throw validationFailed("The adjudicated answer does not match the schema.", {
      issues: validation.issues,
    });
  }
  if (validation.missingRequired.length > 0) {
    throw validationFailed("Complete the required answers.", {
      missing: validation.missingRequired,
    });
  }
  if (input.chosenAnnotationId) {
    const chosen = access.task.annotations.find(
      (annotation) => annotation.id === input.chosenAnnotationId,
    );
    if (!chosen) throw notFound("Chosen annotation not found on this task.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AnnotationTask" WHERE id = ${input.taskId} FOR UPDATE`;
    const task = await tx.annotationTask.findUnique({
      where: { id: input.taskId },
      include: { adjudications: { select: { id: true } } },
    });
    if (!task) throw notFound("Task not found.");
    if (!["DISPUTED", "ADJUDICATION"].includes(task.status)) {
      throw conflict("This task is not disputed.");
    }
    if (task.version !== input.expectedTaskVersion) {
      throw conflict("This task changed since you loaded it. Reload before adjudicating.", {
        reason: "STALE_REVISION",
        currentTaskVersion: task.version,
      });
    }
    if (task.adjudications.length > 0) {
      throw conflict("A final adjudication already exists for this task.");
    }

    const adjudication = await tx.adjudication.create({
      data: {
        taskId: task.id,
        adjudicatorId: input.user.id,
        schemaVersionId: task.schemaVersionId,
        finalAnswer: validation.answer as Prisma.InputJsonValue,
        rationale: input.rationale.trim(),
        chosenAnnotationId: input.chosenAnnotationId ?? null,
        expectedTaskVersion: input.expectedTaskVersion,
      },
    });
    const updatedTask = await tx.annotationTask.update({
      where: { id: task.id },
      data: { status: "RESOLVED", version: { increment: 1 } },
    });

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "adjudication.completed",
      targetType: "AnnotationTask",
      targetId: task.id,
      metadata: {
        projectId: input.projectId,
        adjudicationId: adjudication.id,
        chosenAnnotationId: input.chosenAnnotationId ?? null,
      },
    });

    return {
      adjudicationId: adjudication.id,
      taskStatus: updatedTask.status,
      taskVersion: updatedTask.version,
    };
  });
}
