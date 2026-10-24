import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { ReleasePublisher } from "@/components/ReleasePublisher";
import { EmptyState } from "@/components/EmptyState";
import { requireProjectPage } from "@/auth/project-page";
import { isManager } from "@/auth/permissions";
import { getProjectOverview } from "@/services/projects";
import { listSchemaVersions } from "@/services/schemas";
import { listReleases } from "@/services/releases";
import { formatDateTime, formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Releases",
};

export default async function ReleasesPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);
  const [overview, schemas, releaseData] = await Promise.all([
    getProjectOverview(projectId),
    listSchemaVersions(projectId),
    listReleases(projectId),
  ]);
  if (!overview) notFound();

  const versions = overview.project.dataset?.versions ?? [];
  const publishedSchemas = schemas
    .filter((schema) => schema.status === "PUBLISHED")
    .map((schema) => ({ id: schema.id, versionNumber: schema.versionNumber }));

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
          <p className="eyebrow">Immutable outputs</p>
          <h2 className="display-md">Dataset releases</h2>
          <p className="lede small">
            Each release is a stored snapshot with deterministic JSONL and
            formula-safe CSV exports, a provenance manifest, and SHA-256 checksums.
            Re-downloading a release returns the same content.
          </p>
        </div>

        {isManager(access.roles) ? (
          <ReleasePublisher
            workspaceId={workspaceId}
            projectId={projectId}
            schemas={publishedSchemas}
            datasetVersions={versions.map((version) => ({
              id: version.id,
              versionNumber: version.versionNumber,
              recordCount: version.recordCount,
            }))}
          />
        ) : (
          <div className="notice small">
            Managers and owners publish releases. All workspace members can audit
            and download published releases.
          </div>
        )}

        <section className="stack">
          <div className="spread">
            <div>
              <p className="eyebrow">History</p>
              <h3 className="display-sm">Published snapshots</h3>
            </div>
            <p className="small muted">{releaseData.total} releases</p>
          </div>

          {releaseData.releases.length === 0 ? (
            <EmptyState
              title="No release yet"
              body={
                isManager(access.roles)
                  ? "Accept or adjudicate at least one task, then publish a release to freeze the output."
                  : "A manager has not published a release for this project."
              }
              actionHref={
                isManager(access.roles)
                  ? `/workspaces/${workspaceId}/projects/${projectId}/review`
                  : undefined
              }
              actionLabel={isManager(access.roles) ? "Open review" : undefined}
            />
          ) : (
            <div className="stack">
              {releaseData.releases.map((release) => {
                const manifest = release.manifest as {
                  selectionPolicy?: string;
                  counts?: { exclusions?: Record<string, number> };
                  checksums?: { jsonlSha256?: string; csvSha256?: string };
                  dataset?: { versionNumber?: number };
                  schema?: { versionNumber?: number };
                };
                return (
                  <article className="card card-pad stack" key={release.id}>
                    <div className="spread">
                      <div>
                        <p className="eyebrow">Release v{release.versionNumber}</p>
                        <h3 className="display-sm">
                          {release.recordCount} records ·{" "}
                          {formatPercent(
                            release.recordCount + release.excludedCount === 0
                              ? null
                              : release.recordCount /
                                  (release.recordCount + release.excludedCount),
                            0,
                          )}{" "}
                          included
                        </h3>
                        <p className="tiny muted">
                          Published {formatDateTime(release.publishedAt)} by{" "}
                          {release.createdBy.displayName}
                        </p>
                      </div>
                      <span className="badge status-accepted">Published</span>
                    </div>

                    <div className="meta-row">
                      <span>Dataset v{manifest.dataset?.versionNumber ?? "?"}</span>
                      <span>Schema v{manifest.schema?.versionNumber ?? "?"}</span>
                      <span>{release.annotationCount} annotations referenced</span>
                      <span>{release.excludedCount} excluded tasks</span>
                      <span className="mono">
                        policy {manifest.selectionPolicy ?? release.selectionPolicy}
                      </span>
                    </div>

                    <div className="panel panel-pad stack" style={{ gap: "0.4rem" }}>
                      <p className="field-label">SHA-256 checksums</p>
                      <p className="mono tiny" style={{ overflowWrap: "anywhere" }}>
                        JSONL · {release.checksum}
                      </p>
                      <p className="mono tiny" style={{ overflowWrap: "anywhere" }}>
                        CSV · {release.csvChecksum}
                      </p>
                      <p className="tiny muted">
                        The export route verifies these checksums before sending
                        bytes.
                      </p>
                    </div>

                    <div className="cluster">
                      <a
                        className="btn btn-primary btn-sm"
                        href={`/api/releases/${release.id}/export?format=bundle`}
                      >
                        Download release bundle
                      </a>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/api/releases/${release.id}/export?format=jsonl`}
                      >
                        JSONL
                      </a>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/api/releases/${release.id}/export?format=csv`}
                      >
                        CSV
                      </a>
                      <a
                        className="btn btn-ghost btn-sm"
                        href={`/api/releases/${release.id}/export?format=manifest`}
                      >
                        Manifest JSON
                      </a>
                    </div>

                    <details className="panel panel-pad">
                      <summary className="field-label" style={{ cursor: "pointer" }}>
                        Inspect provenance manifest
                      </summary>
                      <pre
                        className="code-card"
                        style={{ marginTop: "0.7rem", maxHeight: "26rem" }}
                      >
                        {JSON.stringify(release.manifest, null, 2)}
                      </pre>
                    </details>

                    {manifest.counts?.exclusions &&
                    Object.values(manifest.counts.exclusions).some((count) => count > 0) ? (
                      <details>
                        <summary className="tiny muted" style={{ cursor: "pointer" }}>
                          Exclusions by reason
                        </summary>
                        <ul className="metric-limits">
                          {Object.entries(manifest.counts.exclusions)
                            .filter(([, count]) => count > 0)
                            .map(([reason, count]) => (
                              <li key={reason}>
                                {reason.replaceAll("_", " ")}: {count}
                              </li>
                            ))}
                        </ul>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="panel panel-pad stack">
          <p className="field-label">Release contract</p>
          <p className="small muted">
            Selected rows are ordered by source order, then source identifier.
            JSONL values use canonical JSON. CSV values are quoted and protect
            spreadsheet applications from untrusted formulas. The manifest is part
            of the release and stores the counts, schema, dataset version, policy,
            and checksums used to verify the bundle.
          </p>
        </div>
      </div>
    </ProjectChrome>
  );
}
