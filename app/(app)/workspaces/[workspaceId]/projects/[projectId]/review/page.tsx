import type { Metadata } from "next";
import Link from "next/link";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { AnswerSummary } from "@/components/AnswerSummary";
import {
  BeginReviewButton,
  ReviewDecisionForm,
} from "@/components/ReviewActions";
import { StatusBadge } from "@/components/StatusBadge";
import { Forbidden } from "@/components/Forbidden";
import { requireProjectPage } from "@/auth/project-page";
import { canAdjudicate, canReview } from "@/auth/permissions";
import {
  listAdjudicationQueue,
  listReviewQueue,
} from "@/services/review";
import { parseAnnotationSchema } from "@/domain/schema";
import type { AnnotationAnswer } from "@/domain/schema";
import { differingFieldKeys } from "@/lib/answer-display";
import { formatRelative } from "@/lib/format";
import { LIMITS } from "@/domain/limits";

export const metadata: Metadata = {
  title: "Review",
};

function asAnswer(value: unknown): AnnotationAnswer {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnnotationAnswer)
    : {};
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ task?: string; page?: string; decided?: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const query = await searchParams;
  const access = await requireProjectPage(workspaceId, projectId);
  const reviewer = canReview(access.roles);
  const adjudicator = canAdjudicate(access.roles);

  if (!reviewer && !adjudicator) {
    return (
      <Forbidden
        title="Review is for reviewers and managers"
        body="Annotators work on assigned tasks. Reviewers and managers handle submission decisions and adjudication."
        backHref={`/workspaces/${workspaceId}/projects/${projectId}`}
      />
    );
  }

  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const [queue, adjudicationQueue] = await Promise.all([
    listReviewQueue({ projectId, page, limit: LIMITS.tasksPerPage }),
    listAdjudicationQueue({ projectId, page: 1, limit: 20 }),
  ]);
  const selected = query.task
    ? queue.tasks.find((task) => task.id === query.task)
    : null;
  const base = `/workspaces/${workspaceId}/projects/${projectId}/review`;
  const totalPages = Math.max(1, Math.ceil(queue.total / LIMITS.tasksPerPage));

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
        <div className="stack">
          <p className="eyebrow">Human decisions</p>
          <h2 className="display-md">Review and resolve</h2>
          <p className="lede small">
            Compare submitted answers, leave specific feedback, accept or return
            work, and send disagreements to evidence-based adjudication. Every
            decision is tied to the annotation revision the reviewer saw.
          </p>
        </div>

        {query.decided ? (
          <div className="success-note" role="status">
            Decision recorded. The task left the review queue.
          </div>
        ) : null}

        {adjudicationQueue.tasks.length > 0 ? (
          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Adjudication queue</p>
                <h3 className="display-sm">Disputed records</h3>
              </div>
              <span className="badge status-disputed">
                {adjudicationQueue.total} disputed
              </span>
            </div>
            <div className="grid-2">
              {adjudicationQueue.tasks.map((task) => (
                <Link
                  className="schema-version"
                  key={task.id}
                  href={`/workspaces/${workspaceId}/projects/${projectId}/adjudicate/${task.id}`}
                >
                  <div className="spread">
                    <span className="mono">{task.datasetRecord.sourceId}</span>
                    <StatusBadge status={task.status} />
                  </div>
                  <p className="tiny muted" style={{ marginTop: "0.3rem" }}>
                    {task.annotations.length} annotations · updated{" "}
                    {formatRelative(task.updatedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="review-grid">
          <section className="card card-pad stack" aria-label="Review queue">
            <div>
              <p className="eyebrow">Queue</p>
              <h3 className="display-sm">
                {queue.total} task{queue.total === 1 ? "" : "s"} awaiting a decision
              </h3>
            </div>
            {queue.tasks.length === 0 ? (
              <p className="small muted">
                No submitted work is waiting for review. Returned work will appear
                again after it is resubmitted.
              </p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
                {queue.tasks.map((task) => {
                  const submitted = task.annotations.filter(
                    (annotation) => annotation.status === "SUBMITTED",
                  ).length;
                  return (
                    <li key={task.id}>
                      <Link
                        className={`queue-item ${task.id === selected?.id ? "" : ""}`}
                        href={`${base}?task=${task.id}&page=${page}`}
                        aria-current={task.id === selected?.id ? "true" : undefined}
                      >
                        <span className="queue-id">
                          {task.datasetRecord.sourceId} · schema v
                          {task.schemaVersion.versionNumber}
                        </span>
                        <span className="tiny muted">
                          {task.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                          {submitted} submitted · {formatRelative(task.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {totalPages > 1 ? (
              <nav className="pagination" aria-label="Review queue pages">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="cluster">
                  {page > 1 ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={`${base}?page=${page - 1}`}
                    >
                      Newer
                    </Link>
                  ) : null}
                  {page < totalPages ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={`${base}?page=${page + 1}`}
                    >
                      Older
                    </Link>
                  ) : null}
                </div>
              </nav>
            ) : null}
            {!reviewer ? (
              <p className="notice notice-warning small">
                Your roles allow adjudication but not review decisions. You can
                review evidence and resolve disputed tasks.
              </p>
            ) : null}
          </section>

          <section className="stack" aria-label="Selected review">
            {!selected ? (
              <div className="empty-state">
                <p className="eyebrow">Select a task</p>
                <h3 className="display-sm">Choose a record from the queue</h3>
                <p className="small muted">
                  Review mode compares the source record, every submitted answer,
                  and the review history attached to each revision.
                </p>
              </div>
            ) : (
              <ReviewDetail
                task={selected}
                canDecide={reviewer}
                currentUserId={access.user.id}
                workspaceId={workspaceId}
                projectId={projectId}
                afterDecisionHref={`${base}?page=${page}&decided=1`}
              />
            )}
          </section>
        </div>
      </div>
    </ProjectChrome>
  );
}

function ReviewDetail({
  task,
  canDecide,
  currentUserId,
  workspaceId,
  projectId,
  afterDecisionHref,
}: {
  task: Awaited<ReturnType<typeof listReviewQueue>>["tasks"][number];
  canDecide: boolean;
  currentUserId: string;
  workspaceId: string;
  projectId: string;
  afterDecisionHref: string;
}) {
  const parsed = parseAnnotationSchema(task.schemaVersion.schemaJson);
  if (!parsed.ok) {
    return (
      <div className="notice notice-danger">
        The schema pinned to this task is unreadable. Review cannot proceed.
      </div>
    );
  }
  const schema = parsed.schema;
  const nonDraft = task.annotations.filter((annotation) => annotation.status !== "DRAFT");
  const answers = nonDraft.map((annotation) => asAnswer(annotation.answer));
  const differing = differingFieldKeys(schema, answers);
  const record =
    task.datasetRecord.data &&
    typeof task.datasetRecord.data === "object" &&
    !Array.isArray(task.datasetRecord.data)
      ? (task.datasetRecord.data as Record<string, unknown>)
      : {};

  return (
    <div className="stack">
      <div className="record-card">
        <div className="record-head">
          <div>
            <p className="eyebrow">Source record</p>
            <p className="mono" style={{ marginTop: "0.3rem" }}>
              {task.datasetRecord.sourceId}
            </p>
          </div>
          <div className="cluster">
            <StatusBadge status={task.status} />
            <span className="tiny muted">task v{task.version}</span>
          </div>
        </div>
        <div className="record-body">
          {Object.entries(record).map(([key, value]) => (
            <div className="source-field" key={key}>
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
          ))}
        </div>
      </div>

      {differing.length > 0 ? (
        <div className="notice notice-warning small">
          Answers differ on{" "}
          {differing
            .map((key) => schema.fields.find((field) => field.key === key)?.label ?? key)
            .join(", ")}
          . Compare the evidence before deciding.
        </div>
      ) : null}

      {task.annotations.length === 0 ? (
        <p className="small muted">No annotations have been saved for this task.</p>
      ) : (
        <div className="answer-list">
          {task.annotations.map((annotation) => {
            const mine = annotation.annotatorId === currentUserId;
            return (
              <article className="answer-item" key={annotation.id}>
                <header>
                  <div>
                    <strong>{annotation.annotator.displayName}</strong>
                    <p className="tiny muted">
                      revision {annotation.revision} ·{" "}
                      {annotation.submittedAt
                        ? `submitted ${formatRelative(annotation.submittedAt)}`
                        : `saved ${formatRelative(annotation.updatedAt)}`}
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
                        <div className="spread">
                          <strong className="tiny">
                            {review.decision.toLowerCase().replaceAll("_", " ")}
                          </strong>
                          <span className="tiny muted">
                            {review.reviewer.displayName} ·{" "}
                            {formatRelative(review.createdAt)}
                          </span>
                        </div>
                        {review.feedback ? (
                          <p className="small" style={{ marginTop: "0.3rem" }}>
                            {review.feedback}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {annotation.status === "SUBMITTED" &&
                task.status === "SUBMITTED" &&
                canDecide ? (
                  <div style={{ marginTop: "0.8rem" }}>
                    <BeginReviewButton annotationId={annotation.id} />
                  </div>
                ) : null}

                {annotation.status === "SUBMITTED" &&
                canDecide &&
                !mine &&
                (task.status === "SUBMITTED" || task.status === "IN_REVIEW") ? (
                  <div className="panel panel-pad" style={{ marginTop: "0.8rem" }}>
                    <ReviewDecisionForm
                      annotationId={annotation.id}
                      expectedRevision={annotation.revision}
                      annotatorName={annotation.annotator.displayName}
                      afterDecisionHref={afterDecisionHref}
                    />
                  </div>
                ) : null}
                {mine ? (
                  <p className="field-hint" style={{ marginTop: "0.6rem" }}>
                    You cannot review your own annotation.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <Link
        className="btn btn-secondary btn-sm"
        href={`/workspaces/${workspaceId}/projects/${projectId}/quality`}
      >
        See project agreement measures
      </Link>
    </div>
  );
}
