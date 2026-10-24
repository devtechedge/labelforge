import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { ImportWorkbench } from "@/components/ImportWorkbench";
import { Forbidden } from "@/components/Forbidden";
import { StatusBadge } from "@/components/StatusBadge";
import { requireProjectPage } from "@/auth/project-page";
import { isManager } from "@/auth/permissions";
import { getProjectOverview } from "@/services/projects";
import { formatBytes, formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Import data",
};

export default async function ImportPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);
  if (!isManager(access.roles)) {
    return (
      <Forbidden
        title="Managers import data"
        body="Your roles do not include import access. Ask a manager or workspace owner."
        backHref={`/workspaces/${workspaceId}/projects/${projectId}`}
      />
    );
  }

  const overview = await getProjectOverview(projectId);
  if (!overview) notFound();

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
          <p className="eyebrow">Dataset intake</p>
          <h2 className="display-md">Import, validate, commit</h2>
          <p className="lede small">
            The preview is parsed on the server from the uploaded bytes. Commit
            writes valid rows only, in source order, as a new immutable dataset
            version.
          </p>
        </div>

        <div className="panel panel-pad">
          <p className="small muted">
            Limits: 4 MB per file, 10,000 rows per import, 25,000 records per
            project. UTF-8 only. No silent truncation.
          </p>
        </div>

        <ImportWorkbench workspaceId={workspaceId} projectId={projectId} />

        <section className="card card-pad stack">
          <div>
            <p className="eyebrow">History</p>
            <h2 className="display-sm">Recent imports</h2>
          </div>
          {overview.project.importBatches.length === 0 ? (
            <p className="small muted">No import has been attempted in this project.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Recent import batches</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Status</th>
                    <th scope="col">Rows</th>
                    <th scope="col">Size</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.project.importBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <span className="mono tiny">{batch.fileName}</span>
                        <br />
                        <span className="tiny muted">{batch.format}</span>
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td>
                        {batch.validRows} valid / {batch.totalRows} total
                      </td>
                      <td>{formatBytes(batch.byteSize)}</td>
                      <td>{formatDateTime(batch.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tiny muted">
            Sample files: <Link href="/samples/reviews-valid.csv">valid CSV</Link>,{" "}
            <Link href="/samples/reviews-malformed.csv">malformed CSV</Link>,{" "}
            <Link href="/samples/support-valid.jsonl">valid JSONL</Link>,{" "}
            <Link href="/samples/support-malformed.jsonl">malformed JSONL</Link>.
          </p>
        </section>
      </div>
    </ProjectChrome>
  );
}
