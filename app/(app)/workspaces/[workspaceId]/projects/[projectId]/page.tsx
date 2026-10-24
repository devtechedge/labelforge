import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import {
  ArchiveProjectForm,
  DeleteProjectForm,
  UpdateProjectForm,
} from "@/components/ProjectSettingsForms";
import { StatusBadge } from "@/components/StatusBadge";
import { requireProjectPage } from "@/auth/project-page";
import { isManager, isOwner } from "@/auth/permissions";
import { getProjectOverview } from "@/services/projects";
import { listSchemaVersions } from "@/services/schemas";
import { listReleases } from "@/services/releases";
import { formatDate, formatDateTime, pluralize } from "@/lib/format";
import { TASK_STATUS_LABELS } from "@/domain/workflow";

export const metadata: Metadata = {
  title: "Project overview",
};

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const access = await requireProjectPage(workspaceId, projectId);
  const overview = await getProjectOverview(projectId);
  if (!overview) notFound();

  const [schemas, releases] = await Promise.all([
    listSchemaVersions(projectId),
    listReleases(projectId),
  ]);

  const project = overview.project;
  const totalTasks = project._count.tasks;
  const accepted =
    (overview.taskStatusCounts.ACCEPTED ?? 0) +
    (overview.taskStatusCounts.RESOLVED ?? 0);
  const inReview =
    (overview.taskStatusCounts.SUBMITTED ?? 0) +
    (overview.taskStatusCounts.IN_REVIEW ?? 0);
  const attention =
    (overview.taskStatusCounts.RETURNED_FOR_CORRECTION ?? 0) +
    (overview.taskStatusCounts.DISPUTED ?? 0) +
    (overview.taskStatusCounts.ADJUDICATION ?? 0);
  const unassigned = overview.taskStatusCounts.UNASSIGNED ?? 0;
  const latestVersion = project.dataset?.versions[0] ?? null;
  const publishedSchema = schemas.find((schema) => schema.status === "PUBLISHED") ?? null;
  const completion = totalTasks === 0 ? null : accepted / totalTasks;
  const manager = isManager(access.roles);
  const owner = isOwner(access.roles);

  const steps = [
    {
      label: "Dataset committed",
      done: Boolean(project.dataset && project.dataset.versions.length > 0),
      href: `${base(workspaceId, projectId)}/import`,
      action: "Import data",
    },
    {
      label: "Schema published",
      done: Boolean(publishedSchema),
      href: `${base(workspaceId, projectId)}/schema`,
      action: "Publish schema",
    },
    {
      label: "Tasks generated",
      done: totalTasks > 0,
      href: `${base(workspaceId, projectId)}/tasks`,
      action: "Generate tasks",
    },
    {
      label: "Work assigned",
      done: overview.activeAssignees.length > 0,
      href: `${base(workspaceId, projectId)}/tasks`,
      action: "Assign work",
    },
    {
      label: "Finalized record",
      done: accepted > 0,
      href: `${base(workspaceId, projectId)}/review`,
      action: "Review work",
    },
    {
      label: "Release published",
      done: releases.total > 0,
      href: `${base(workspaceId, projectId)}/releases`,
      action: "Publish release",
    },
  ];

  return (
    <ProjectChrome
      workspaceId={workspaceId}
      workspaceName={access.workspace.name}
      projectId={projectId}
      projectName={project.name}
      projectStatus={project.status}
      annotationMode={project.annotationMode}
      roles={access.roles}
      description={project.description}
    >
      <div className="stack-lg">
        {project.status === "ARCHIVED" ? (
          <div className="notice notice-warning">
            This project is archived. Data is intact and read-only for annotation
            work. A manager can restore it.
          </div>
        ) : null}

        <div className="grid-4">
          <div className="stat">
            <span className="stat-value">{totalTasks}</span>
            <span className="stat-label">Tasks</span>
          </div>
          <div className="stat">
            <span className="stat-value">{accepted}</span>
            <span className="stat-label">Accepted or resolved</span>
          </div>
          <div className="stat">
            <span className="stat-value">{inReview}</span>
            <span className="stat-label">In review</span>
          </div>
          <div className="stat">
            <span className="stat-value">{attention}</span>
            <span className="stat-label">Need attention</span>
          </div>
        </div>

        <div className="card card-pad stack">
          <div className="spread">
            <div>
              <p className="eyebrow">Progress</p>
              <h2 className="display-sm">
                {completion === null
                  ? "Waiting for tasks"
                  : `${Math.round(completion * 100)}% finalized`}
              </h2>
            </div>
            <p className="small muted">
              {totalTasks === 0
                ? "No work has been generated."
                : `${accepted} of ${totalTasks} tasks accepted or resolved. ${unassigned} unassigned.`}
            </p>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${(completion ?? 0) * 100}%` }}
            />
          </div>
          <div className="meta-row">
            {Object.entries(overview.taskStatusCounts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span key={status}>
                  <strong>{count}</strong>{" "}
                  {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status}
                </span>
              ))}
          </div>
        </div>

        <section className="stack">
          <p className="eyebrow">Readiness</p>
          <div className="grid-3">
            {steps.map((step, index) => (
              <div className="panel panel-pad stack" key={step.label}>
                <span className="mono tiny muted">0{index + 1}</span>
                <strong>{step.label}</strong>
                <span className="badge" style={step.done ? { background: "var(--success-soft)", color: "var(--success)" } : undefined}>
                  {step.done ? "Done" : "Open"}
                </span>
                {!step.done && manager ? (
                  <Link className="small" href={step.href}>
                    {step.action}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="grid-2">
          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Dataset lineage</p>
                <h2 className="display-sm">Imported versions</h2>
              </div>
              {manager ? (
                <Link className="btn btn-secondary btn-sm" href={`${base(workspaceId, projectId)}/import`}>
                  Import
                </Link>
              ) : null}
            </div>
            {project.dataset?.versions.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Dataset versions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Version</th>
                      <th scope="col">Records</th>
                      <th scope="col">Format</th>
                      <th scope="col">Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.dataset.versions.map((version) => (
                      <tr key={version.id}>
                        <td className="mono">v{version.versionNumber}</td>
                        <td>{version.recordCount.toLocaleString()}</td>
                        <td>{version.format}</td>
                        <td>{formatDate(version.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="small muted">
                No dataset version committed. The current container is empty.
              </p>
            )}
            {latestVersion ? (
              <p className="tiny muted mono" style={{ overflowWrap: "anywhere" }}>
                Current: v{latestVersion.versionNumber} · content checksum{" "}
                {latestVersion.contentChecksum.slice(0, 16)}...
              </p>
            ) : null}
          </section>

          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Schema history</p>
                <h2 className="display-sm">Immutable versions</h2>
              </div>
              {manager ? (
                <Link className="btn btn-secondary btn-sm" href={`${base(workspaceId, projectId)}/schema`}>
                  Schema
                </Link>
              ) : null}
            </div>
            {schemas.length === 0 ? (
              <p className="small muted">No schema version has been created.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                {schemas.slice(0, 5).map((schema) => (
                  <li className="schema-version" key={schema.id}>
                    <div className="spread">
                      <span className="mono">v{schema.versionNumber}</span>
                      <StatusBadge status={schema.status === "PUBLISHED" ? "ACCEPTED" : "DRAFT"} />
                    </div>
                    <p className="tiny muted" style={{ marginTop: "0.3rem" }}>
                      {schema._count.tasks} tasks · {schema._count.annotations} annotations ·{" "}
                      {formatDate(schema.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid-2">
          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Workload</p>
                <h2 className="display-sm">Active assignees</h2>
              </div>
            </div>
            {overview.activeAssignees.length === 0 ? (
              <p className="small muted">No active assignments yet.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
                {overview.activeAssignees.map((assignee) => (
                  <li className="member-row" key={assignee.id}>
                    <span>{assignee.displayName}</span>
                    <span className="mono tiny">{pluralize(assignee.count, "task")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Releases</p>
                <h2 className="display-sm">Published snapshots</h2>
              </div>
              <Link className="btn btn-secondary btn-sm" href={`${base(workspaceId, projectId)}/releases`}>
                Open releases
              </Link>
            </div>
            {releases.releases.length === 0 ? (
              <p className="small muted">No release has been published.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                {releases.releases.slice(0, 3).map((release) => (
                  <li className="schema-version" key={release.id}>
                    <div className="spread">
                      <span className="mono">Release v{release.versionNumber}</span>
                      <span className="tiny muted">{formatDate(release.createdAt)}</span>
                    </div>
                    <p className="tiny muted" style={{ marginTop: "0.3rem" }}>
                      {release.recordCount} records · {release.excludedCount} excluded ·{" "}
                      {release.checksum.slice(0, 12)}...
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {manager ? (
          <section className="card card-pad stack-lg" id="project-settings">
            <div>
              <p className="eyebrow">Project administration</p>
              <h2 className="display-sm">Settings and lifecycle</h2>
              <p className="small muted">
                Created {formatDateTime(project.createdAt)}. Project changes are
                recorded in the workspace audit log.
              </p>
            </div>
            <UpdateProjectForm
              workspaceId={workspaceId}
              projectId={projectId}
              name={project.name}
              description={project.description}
              annotationMode={project.annotationMode}
              annotationsPerTask={project.annotationsPerTask}
              tasksExist={totalTasks > 0}
            />
            <div className="spread rule" style={{ paddingTop: "1rem" }}>
              <div>
                <p className="field-label">Archive or restore</p>
                <p className="small muted">
                  Archiving is reversible and does not delete data.
                </p>
              </div>
              <ArchiveProjectForm
                workspaceId={workspaceId}
                projectId={projectId}
                archived={project.status === "ARCHIVED"}
              />
            </div>
            {owner ? (
              <div className="rule" style={{ paddingTop: "1rem" }}>
                <p className="field-label">Permanent deletion</p>
                <p className="small muted" style={{ marginBottom: "0.8rem" }}>
                  Deletes imported records, annotations, reviews, adjudications,
                  and releases. This cannot be undone.
                </p>
                <DeleteProjectForm
                  workspaceId={workspaceId}
                  projectId={projectId}
                  name={project.name}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </ProjectChrome>
  );
}

function base(workspaceId: string, projectId: string): string {
  return `/workspaces/${workspaceId}/projects/${projectId}`;
}
