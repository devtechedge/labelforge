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
  const completedSteps = steps.filter((step) => step.done).length;

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
          <div className="cluster" style={{ gap: "0.35rem" }}>
            {Object.entries(overview.taskStatusCounts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span
                  className={`badge status-${status.toLowerCase().replaceAll("_", "-")}`}
                  key={status}
                >
                  {count}{" "}
                  {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status}
                </span>
              ))}
          </div>
        </div>

        <section className="stack">
          <div className="spread">
            <div>
              <p className="eyebrow">Readiness</p>
              <h2 className="display-sm">The path to a release</h2>
            </div>
            <p className="mono tiny muted">
              {completedSteps} / {steps.length} complete
            </p>
          </div>
          <div className="checklist">
            {steps.map((step, index) => (
              <div
                className="check-item"
                data-done={step.done ? "true" : "false"}
                key={step.label}
              >
                <span className="check-mark" aria-hidden="true">
                  {step.done ? "✓" : String(index + 1).padStart(2, "0")}
                </span>
                <div className="check-body">
                  <strong>{step.label}</strong>
                  <span>{step.done ? "Complete" : "Open"}</span>
                </div>
                {!step.done && manager ? (
                  <Link href={step.href}>{step.action}</Link>
                ) : step.done ? (
                  <Link href={step.href}>View</Link>
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
              <div className="ledger">
                {project.dataset.versions.map((version, index) => (
                  <div className="ledger-row" key={version.id}>
                    <span className="ledger-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ledger-main">
                      <strong>
                        v{version.versionNumber} /{" "}
                        {version.recordCount.toLocaleString()} records
                      </strong>
                      <span>
                        {version.format} / imported {formatDate(version.createdAt)}
                      </span>
                    </div>
                    <span className="ledger-meta">
                      {latestVersion?.id === version.id ? "Current" : "Stored"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">
                No dataset version committed. The current container is empty.
              </p>
            )}
            {latestVersion ? (
              <p className="mono tiny muted" style={{ overflowWrap: "anywhere" }}>
                content checksum {latestVersion.contentChecksum.slice(0, 20)}...
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
              <div className="ledger">
                {schemas.slice(0, 5).map((schema, index) => (
                  <div className="ledger-row" key={schema.id}>
                    <span className="ledger-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ledger-main">
                      <strong>Schema v{schema.versionNumber}</strong>
                      <span>
                        {schema._count.tasks} tasks / {schema._count.annotations}{" "}
                        annotations / {formatDate(schema.createdAt)}
                      </span>
                    </div>
                    <StatusBadge status={schema.status} />
                  </div>
                ))}
              </div>
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
              <div className="ledger">
                {overview.activeAssignees.map((assignee, index) => (
                  <div className="ledger-row" key={assignee.id}>
                    <span className="ledger-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ledger-main">
                      <strong>{assignee.displayName}</strong>
                      <span>active assignee</span>
                    </div>
                    <span className="ledger-meta">
                      {pluralize(assignee.count, "task")}
                    </span>
                  </div>
                ))}
              </div>
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
              <div className="ledger">
                {releases.releases.slice(0, 3).map((release, index) => (
                  <div className="ledger-row" key={release.id}>
                    <span className="ledger-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ledger-main">
                      <strong>Release v{release.versionNumber}</strong>
                      <span>
                        {release.recordCount} records / {release.excludedCount}{" "}
                        excluded / {formatDate(release.createdAt)}
                      </span>
                    </div>
                    <span className="ledger-meta">
                      {release.checksum.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {manager ? (
          <details className="admin-drawer" id="project-settings">
            <summary>
              <div className="stack" style={{ gap: "0.2rem" }}>
                <p className="eyebrow">Project administration</p>
                <h2 className="display-sm">Settings and lifecycle</h2>
              </div>
              <span className="mono tiny muted">Open</span>
            </summary>
            <div className="card card-pad stack-lg">
              <p className="small muted">
                Created {formatDateTime(project.createdAt)}. Project changes are
                recorded in the workspace audit log.
              </p>
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
            </div>
          </details>
        ) : null}
      </div>
    </ProjectChrome>
  );
}

function base(workspaceId: string, projectId: string): string {
  return `/workspaces/${workspaceId}/projects/${projectId}`;
}
