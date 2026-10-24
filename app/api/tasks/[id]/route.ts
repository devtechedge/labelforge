import { apiOk, handleApiError } from "@/lib/api";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { canReview, isManager } from "@/auth/permissions";
import { getTaskAccess } from "@/repositories/access";
import { requireTaskApi } from "@/repositories/api-access";
import { parseAnnotationSchema } from "@/domain/schema";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireTaskApi(id);
    const detail = await getTaskAccess(
      access.user,
      access.task.workspaceId,
      access.task.projectId,
      id,
    );
    if (!detail) throw notFound("Task not found.");

    const schema = parseAnnotationSchema(detail.task.schemaVersion.schemaJson);
    if (!schema.ok) throw conflict("The pinned schema is unreadable.");

    const privileged = isManager(access.roles) || canReview(access.roles);
    const myAssignment = detail.task.assignments.find(
      (assignment) => assignment.userId === access.user.id,
    );
    const myAnnotation = detail.task.annotations.find(
      (annotation) => annotation.annotatorId === access.user.id,
    );

    if (!privileged && !myAssignment) {
      throw forbidden("This task is not assigned to you.");
    }

    const visibleAnnotations = privileged
      ? detail.task.annotations
      : detail.task.annotations.filter(
          (annotation) => annotation.annotatorId === access.user.id,
        );

    return apiOk({
      task: {
        id: detail.task.id,
        status: detail.task.status,
        version: detail.task.version,
        requiredAnnotations: detail.task.requiredAnnotations,
        priority: detail.task.priority,
        sourceId: detail.task.datasetRecord.sourceId,
        sourceOrder: detail.task.datasetRecord.sourceOrder,
        record: detail.task.datasetRecord.data,
        schema: schema.schema,
        schemaVersionId: detail.task.schemaVersionId,
        schemaVersionNumber: detail.task.schemaVersion.versionNumber,
        assignments: privileged ? detail.task.assignments : undefined,
        annotations: visibleAnnotations.map((annotation) => ({
          id: annotation.id,
          annotatorId: annotation.annotatorId,
          annotatorName: annotation.annotator.displayName,
          status: annotation.status,
          revision: annotation.revision,
          answer: annotation.answer,
          submittedAt: annotation.submittedAt,
          reviews: annotation.reviews.map((review) => ({
            id: review.id,
            decision: review.decision,
            feedback: review.feedback,
            createdAt: review.createdAt,
            reviewerName: review.reviewer.displayName,
            observedRevision: review.observedRevision,
          })),
        })),
        adjudications: privileged
          ? detail.task.adjudications.map((adjudication) => ({
              id: adjudication.id,
              finalAnswer: adjudication.finalAnswer,
              rationale: adjudication.rationale,
              adjudicatorName: adjudication.adjudicator.displayName,
              createdAt: adjudication.createdAt,
            }))
          : undefined,
      },
      myAssignment: myAssignment
        ? { id: myAssignment.id, status: myAssignment.status }
        : null,
      myAnnotationId: myAnnotation?.id ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
