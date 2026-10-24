import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { EmptyState } from "@/components/EmptyState";
import { requireProjectPage } from "@/auth/project-page";
import { getProjectQuality } from "@/services/quality";
import { formatMetric, formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Quality",
};

export default async function QualityPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);
  const quality = await getProjectQuality(projectId);
  if (!quality) notFound();

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
          <p className="eyebrow">Measured, not invented</p>
          <h2 className="display-md">Quality and agreement</h2>
          <p className="lede small">
            Counts come from stored task and annotation states. Agreement is only
            reported when the sample supports it. Every score carries its sample
            size and limitations.
          </p>
        </div>

        {quality.totals.totalTasks === 0 ? (
          <EmptyState
            title="No tasks to measure"
            body="Import a dataset, publish a schema, and generate tasks before quality measures can be computed."
            actionHref={`/workspaces/${workspaceId}/projects/${projectId}`}
            actionLabel="Back to project"
          />
        ) : (
          <>
            <div className="grid-4">
              <div className="stat">
                <span className="stat-value">{quality.totals.totalTasks}</span>
                <span className="stat-label">Tasks</span>
              </div>
              <div className="stat">
                <span className="stat-value">{quality.totals.finalized}</span>
                <span className="stat-label">Finalized</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {formatPercent(quality.totals.completeness, 1)}
                </span>
                <span className="stat-label">Completeness</span>
              </div>
              <div className="stat">
                <span className="stat-value">{quality.totals.disputed}</span>
                <span className="stat-label">In dispute</span>
              </div>
            </div>

            <div className="grid-2">
              <section className="card card-pad stack">
                <p className="eyebrow">Workflow state</p>
                <h3 className="display-sm">Task distribution</h3>
                <ul className="limit-list">
                  {Object.entries(quality.taskStatusCounts)
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => (
                      <li key={status}>
                        <span>
                          {quality.taskStatusLabels[
                            status as keyof typeof quality.taskStatusLabels
                          ] ?? status}
                        </span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                </ul>
              </section>
              <section className="card card-pad stack">
                <p className="eyebrow">Review outcomes</p>
                <h3 className="display-sm">Decisions recorded</h3>
                {Object.keys(quality.reviewDecisionCounts).length === 0 ? (
                  <p className="small muted">No review decisions have been recorded.</p>
                ) : (
                  <ul className="limit-list">
                    {Object.entries(quality.reviewDecisionCounts).map(
                      ([decision, count]) => (
                        <li key={decision}>
                          <span>{decision.toLowerCase().replaceAll("_", " ")}</span>
                          <strong>{count}</strong>
                        </li>
                      ),
                    )}
                  </ul>
                )}
                <p className="tiny muted">
                  {quality.totals.reviewPending} tasks are submitted or in review.
                </p>
              </section>
            </div>

            {quality.schemaQuality.length === 0 ? (
              <div className="notice">
                No comparable annotations exist yet. Agreement requires at least
                two non-draft annotations of the same task under the same schema
                version.
              </div>
            ) : (
              <div className="stack-lg">
                {quality.schemaQuality.map((group) => (
                  <section className="card card-pad stack" key={group.schemaVersionId}>
                    <div className="spread">
                      <div>
                        <p className="eyebrow">Agreement</p>
                        <h3 className="display-sm">
                          Schema v{group.versionNumber}
                        </h3>
                        <p className="tiny muted">
                          {group.comparableTasks} tasks with two or more non-draft
                          annotations
                        </p>
                      </div>
                      <span className="badge">{group.status.toLowerCase()}</span>
                    </div>

                    {group.parseError ? (
                      <p className="error-summary">
                        This schema version is unreadable, so no measure is shown.
                      </p>
                    ) : group.fields.length === 0 ? (
                      <p className="small muted">
                        This schema has no fields with a defined agreement measure.
                        Text, number, and boolean fields have no fabricated score.
                      </p>
                    ) : (
                      <div className="grid-2">
                        {group.fields.map((field) => (
                          <article className="metric-card" key={field.fieldKey}>
                            <div className="spread">
                              <div>
                                <p className="field-label">{field.fieldLabel}</p>
                                <p className="tiny muted">
                                  {field.type.replaceAll("_", " ")} ·{" "}
                                  {field.comparablePairs} comparable pairs
                                </p>
                              </div>
                              {field.metric.state === "computed" ? (
                                <span className="metric-value">
                                  {formatMetric(field.metric.value)}
                                </span>
                              ) : (
                                <span className="badge status-unassigned">
                                  {field.metric.state === "insufficient"
                                    ? "Insufficient"
                                    : "Unsupported"}
                                </span>
                              )}
                            </div>

                            {field.metric.state === "computed" ? (
                              <div className="metric-meta">
                                {field.metric.metric === "cohens_kappa" ? (
                                  <>
                                    Cohen&apos;s kappa. Observed agreement{" "}
                                    {field.metric.observedAgreement.numerator} of{" "}
                                    {field.metric.observedAgreement.denominator} pairs.
                                    Expected agreement{" "}
                                    {formatPercent(field.metric.expectedAgreement, 1)}.
                                    Sample {field.metric.sampleSize} pairs.
                                  </>
                                ) : null}
                                {field.metric.metric === "average_jaccard" ? (
                                  <>
                                    Average Jaccard. Total pair score{" "}
                                    {formatMetric(field.metric.totalScore)} across{" "}
                                    {field.metric.pairCount} pairs. Sample{" "}
                                    {field.metric.sampleSize} pairs.
                                  </>
                                ) : null}
                                {field.metric.metric === "span_overlap" ? (
                                  <>
                                    Span overlap. {field.metric.matchedUnits} matched
                                    units of {field.metric.possibleUnits} possible.
                                    Sample {field.metric.sampleSize} pairs.
                                  </>
                                ) : null}
                              </div>
                            ) : null}

                            {field.metric.state === "insufficient" ? (
                              <div className="metric-meta">
                                {field.metric.reason} Sample {field.metric.sampleSize};
                                at least {field.metric.minimumSample} pairs are
                                required.
                              </div>
                            ) : null}

                            {field.metric.state === "unsupported" ? (
                              <div className="metric-meta">{field.metric.reason}</div>
                            ) : null}

                            {field.pairsWithMissingValue > 0 ? (
                              <p className="tiny muted">
                                {field.pairsWithMissingValue} pairs were skipped
                                because at least one side had no value.
                              </p>
                            ) : null}

                            {field.metric.limitations.length > 0 ? (
                              <details>
                                <summary className="tiny muted" style={{ cursor: "pointer" }}>
                                  Limitations
                                </summary>
                                <ul className="metric-limits">
                                  {field.metric.limitations.map((limitation) => (
                                    <li key={limitation.code}>{limitation.message}</li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}

            <div className="panel panel-pad stack">
              <p className="field-label">How to read these measures</p>
              <p className="small muted">
                Single choice fields use Cohen&apos;s kappa on paired annotations.
                Multi-label fields use average Jaccard. Span fields use label-aware
                overlap with a 0.5 intersection-over-union match. Structured text,
                number, and boolean fields have no defined agreement metric here.
                Scores are descriptive of this project sample, not a model quality
                claim. {quality.sampleTruncated
                  ? "The annotation sample hit the calculation ceiling; results are incomplete."
                  : `This page evaluated ${quality.annotationSample} non-draft annotations.`}
              </p>
              <div className="cluster">
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/workspaces/${workspaceId}/projects/${projectId}/review`}
                >
                  Open review
                </Link>
                <Link
                  className="btn btn-ghost btn-sm"
                  href={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
                >
                  Open tasks
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </ProjectChrome>
  );
}
