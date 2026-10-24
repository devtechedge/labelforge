import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnnotationWorkbench, type WorkbenchData } from "@/components/AnnotationWorkbench";
import { Forbidden } from "@/components/Forbidden";
import { requireProjectPage } from "@/auth/project-page";
import { isAppError } from "@/lib/errors";
import { parseAnnotationSchema } from "@/domain/schema";
import type { AnnotationAnswer } from "@/domain/schema";
import { getAnnotateContext } from "@/services/tasks";

export const metadata: Metadata = {
  title: "Annotation workbench",
};

export default async function AnnotatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; taskId: string }>;
}) {
  const { workspaceId, projectId, taskId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);

  let context;
  try {
    context = await getAnnotateContext({
      user: access.user,
      workspaceId,
      projectId,
      taskId,
    });
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "FORBIDDEN") {
        return (
          <Forbidden
            title="This task is not assigned to you"
            body="Annotators can open only tasks with an active assignment. Ask a manager for work or return to your task list."
            backHref={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
          />
        );
      }
      return (
        <main id="main-content" className="page container-narrow">
          <div className="empty-state">
            <p className="eyebrow">Workbench unavailable</p>
            <h1 className="display-sm">This task cannot be opened</h1>
            <p className="lede small">{error.message}</p>
            <Link
              className="btn btn-secondary"
              href={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
            >
              Back to tasks
            </Link>
          </div>
        </main>
      );
    }
    throw error;
  }

  const parsedSchema = parseAnnotationSchema(context.task.schemaVersion.schemaJson);
  if (!parsedSchema.ok) {
    return (
      <main id="main-content" className="page container-narrow">
        <div className="empty-state">
          <p className="eyebrow">Schema problem</p>
          <h1 className="display-sm">The pinned schema is unreadable</h1>
          <p className="lede small">
            A manager needs to create and publish a new schema version. Existing
            answers are preserved under the original version.
          </p>
          <Link
            className="btn btn-secondary"
            href={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
          >
            Back to tasks
          </Link>
        </div>
      </main>
    );
  }

  const annotation = context.annotation;
  const answer =
    annotation?.answer &&
    typeof annotation.answer === "object" &&
    !Array.isArray(annotation.answer)
      ? (annotation.answer as AnnotationAnswer)
      : {};

  const data: WorkbenchData = {
    workspaceId,
    workspaceName: access.workspace.name,
    projectId,
    projectName: access.project.name,
    task: {
      id: context.task.id,
      status: context.task.status,
      version: context.task.version,
      requiredAnnotations: context.task.requiredAnnotations,
      sourceId: context.task.datasetRecord.sourceId,
      sourceOrder: context.task.datasetRecord.sourceOrder,
      record: context.task.datasetRecord.data as Record<string, unknown>,
      schema: parsedSchema.schema,
      schemaVersionNumber: context.task.schemaVersion.versionNumber,
    },
    annotation: annotation
      ? {
          id: annotation.id,
          status: annotation.status,
          revision: annotation.revision,
          answer,
          submittedAt: annotation.submittedAt?.toISOString() ?? null,
          lastSavedAt: annotation.lastSavedAt.toISOString(),
          reviews: annotation.reviews.map((review) => ({
            id: review.id,
            decision: review.decision,
            feedback: review.feedback,
            reviewerName: review.reviewer.displayName,
            createdAt: review.createdAt.toISOString(),
          })),
        }
      : null,
    queue: context.queue.map((task) => ({
      id: task.id,
      status: task.status,
      sourceId: task.datasetRecord.sourceId,
      annotationStatus: task.annotations[0]?.status ?? null,
    })),
  };

  return <AnnotationWorkbench data={data} />;
}
