import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { AnswerSummary } from "@/components/AnswerSummary";
import {
  AdjudicationForm,
  BeginAdjudicationButton,
} from "@/components/AdjudicationForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Forbidden } from "@/components/Forbidden";
import { requireProjectPage } from "@/auth/project-page";
import { canAdjudicate } from "@/auth/permissions";
import { getTaskAccess } from "@/repositories/access";
import { parseAnnotationSchema } from "@/domain/schema";
import type { AnnotationAnswer } from "@/domain/schema";
import { differingFieldKeys } from "@/lib/answer-display";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata: Metadata = {
  title: "Adjudicate task",
};

function asAnswer(value: unknown): AnnotationAnswer {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnnotationAnswer)
    : {};
}

export default async function AdjudicatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; taskId: string }>;
}) {
  const { workspaceId, projectId, taskId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);
  if (!canAdjudicate(access.roles)) {
    return (
      <Forbidden
        title="Adjudication is for reviewers and managers"
        body="Your roles can annotate or administer work, but not resolve disputed answers."
        backHref={`/workspaces/${workspaceId}/projects/${projectId}/review`}
      />
    );
  }

  const detail = await getTaskAccess(access.user, workspaceId, projectId, taskId);
  if (!detail) notFound();

  const parsed = parseAnnotationSchema(detail.task.schemaVersion.schemaJson);
  if (!parsed.ok) {
    return (
      <main id="main-content" className="page container-narrow">
        <div className="empty-state">
          <p className="eyebrow">Schema problem</p>
          <h1 className="display-sm">The pinned schema is unreadable</h1>
          <p className="lede small">
            Adjudication cannot proceed safely. Create and publish a corrected
            schema version first.
          </p>
          <Link
            className="btn btn-secondary"
            href={`/workspaces/${workspaceId}/projects/${projectId}/review`}
          >
            Back to review
          </Link>
        </div>
      </main>
    );
  }

  const schema = parsed.schema;
  const annotations = detail.task.annotations.filter(
    (annotation) => annotation.status !== "DRAFT",
  );
  const answers = annotations.map((annotation) => asAnswer(annotation.answer));
  const differing = differingFieldKeys(schema, answers);
  const adjudication = detail.task.adjudications[0] ?? null;
  const myAnnotation = annotations.some(
    (annotation) => annotation.annotatorId === access.user.id,
  );
  const record =
    detail.task.datasetRecord.data &&
    typeof detail.task.datasetRecord.data === "object" &&
    !Array.isArray(detail.task.datasetRecord.data)
      ? (detail.task.datasetRecord.data as Record<string, unknown>)
      : {};

  return (
    <ProjectChrome
      workspaceId={workspaceId}
      workspaceName={access.workspace.name}
      projectId={projectId}
      projectName={access.project.name}
      projectStatus={access.project.status}
      annotationMode={access.project.annotationMode}
      roles={access.roles}
      description={access.project.description}
    >
      <div className="stack-lg">
        <div className="page-intro">
          <div>
            <p className="eyebrow">Evidence-based resolution</p>
            <h2 className="display-md">
              Adjudicate {detail.task.datasetRecord.sourceId}
            </h2>
            <p className="intro-meta">
              <span>Compare every annotation</span>
              <span>Choose or correct the final answer</span>
              <span>History is never overwritten</span>
            </p>
          </div>
          <div className="intro-actions">
            <StatusBadge status={detail.task.status} />
            <span className="mono tiny muted">task v{detail.task.version}</span>
          </div>
        </div>

        {!["DISPUTED", "ADJUDICATION", "RESOLVED"].includes(detail.task.status) ? (
          <div className="notice notice-warning">
            This task is not disputed. Only disputed tasks can be adjudicated.{" "}
            <Link href={`/workspaces/${workspaceId}/projects/${projectId}/review`}>
              Return to review
            </Link>
            .
          </div>
        ) : null}

        <div className="grid-2">
          <section className="record-card">
            <div className="record-head">
              <p className="eyebrow">Source record</p>
              <span className="tiny muted">schema v{detail.task.schemaVersion.versionNumber}</span>
            </div>
            <div className="record-body">
              {Object.entries(record).map(([key, value], index) => (
                <div className="source-field" key={key}>
                  <span className="source-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className="source-label">{key}</span>
                    <div className="source-text">
                      {typeof value === "string"
                        ? value
                        : typeof value === "number" || typeof value === "boolean"
                          ? String(value)
                          : value === null
                            ? "No value"
                            : JSON.stringify(value, null, 2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card card-pad stack">
            <div>
              <p className="eyebrow">Annotations</p>
              <h3 className="display-sm">{annotations.length} independent records</h3>
            </div>
            {differing.length > 0 ? (
              <div className="notice notice-warning small">
                Disagreement on{" "}
                {differing
                  .map((key) => schema.fields.find((field) => field.key === key)?.label ?? key)
                  .join(", ")}
                .
              </div>
            ) : null}
            <div className="answer-list">
              {annotations.map((annotation) => (
                <article className="answer-item" key={annotation.id}>
                  <header>
                    <div>
                      <strong>{annotation.annotator.displayName}</strong>
                      <p className="tiny muted">
                        revision {annotation.revision} ·{" "}
                        {annotation.submittedAt
                          ? formatRelative(annotation.submittedAt)
                          : "not submitted"}
                      </p>
                    </div>
                    <StatusBadge status={annotation.status} />
                  </header>
                  <AnswerSummary
                    schema={schema}
                    answer={asAnswer(annotation.answer)}
                    differingFields={differing}
                  />
                  {annotation.reviews.length > 0 ? (
                    <div className="feedback-list">
                      {annotation.reviews.map((review) => (
                        <div className="feedback-item" key={review.id}>
                          <strong className="tiny">
                            {review.decision.toLowerCase().replaceAll("_", " ")}
                          </strong>
                          <p className="small">{review.feedback ?? "No feedback."}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        {detail.task.status === "RESOLVED" && adjudication ? (
          <section className="card card-pad stack">
            <div>
              <p className="eyebrow">Resolved</p>
              <h3 className="display-sm">Final answer</h3>
              <p className="small muted">
                By {adjudication.adjudicator.displayName} on{" "}
                {formatDateTime(adjudication.createdAt)}
              </p>
            </div>
            <div className="grid-2">
              <div className="panel panel-pad">
                <AnswerSummary
                  schema={schema}
                  answer={asAnswer(adjudication.finalAnswer)}
                />
              </div>
              <div className="panel panel-pad">
                <p className="field-label">Rationale</p>
                <p className="small" style={{ marginTop: "0.4rem" }}>
                  {adjudication.rationale}
                </p>
              </div>
            </div>
            <div className="cluster">
              <Link
                className="btn btn-secondary"
                href={`/workspaces/${workspaceId}/projects/${projectId}/releases`}
              >
                Open releases
              </Link>
              <Link
                className="btn btn-ghost"
                href={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
              >
                Back to tasks
              </Link>
            </div>
          </section>
        ) : detail.task.status === "DISPUTED" ? (
          <section className="card card-pad stack">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3 className="display-sm">Enter adjudication</h3>
              <p className="small muted">
                A reviewer requested adjudication. Beginning the process moves the
                task to Adjudication and records who is resolving it.
              </p>
            </div>
            {myAnnotation ? (
              <div className="notice notice-warning small">
                You annotated this task, so a different reviewer or manager must
                resolve it.
              </div>
            ) : (
              <BeginAdjudicationButton taskId={detail.task.id} />
            )}
          </section>
        ) : detail.task.status === "ADJUDICATION" ? (
          myAnnotation ? (
            <div className="notice notice-warning">
              You annotated this task, so you cannot adjudicate it. Ask another
              reviewer or manager.
            </div>
          ) : (
            <AdjudicationForm
              taskId={detail.task.id}
              taskVersion={detail.task.version}
              schema={schema}
              record={record}
              annotations={annotations.map((annotation) => ({
                id: annotation.id,
                annotatorName: annotation.annotator.displayName,
                status: annotation.status,
                answer: asAnswer(annotation.answer),
              }))}
            />
          )
        ) : null}
      </div>
    </ProjectChrome>
  );
}
