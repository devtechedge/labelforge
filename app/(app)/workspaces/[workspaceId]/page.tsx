import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser, getWorkspaceAccess } from "@/auth/session";
import { isManager, isOwner, roleLabels } from "@/auth/permissions";
import { getWorkspaceOverview } from "@/services/workspaces";
import { formatDate, pluralize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await requirePageUser();
  const { workspaceId } = await params;
  const access = await getWorkspaceAccess(workspaceId, user);
  if (!access) notFound();

  const overview = await getWorkspaceOverview(workspaceId, user.id);
  if (!overview) notFound();

  const myAssigned = overview.projects.reduce(
    (sum, project) => sum + project.myAssignedCount,
    0,
  );

  return (
    <main id="main-content" className="page">
      <div className="container stack-lg">
        <div className="stack">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/workspaces">Workspaces</Link>
            <span className="sep">/</span>
            <span>{access.workspace.name}</span>
          </nav>
          <div className="spread">
            <div className="stack">
              <p className="eyebrow">Workspace / {access.workspace.slug}</p>
              <h1 className="display-md">{access.workspace.name}</h1>
              <div className="role-pills">
                {roleLabels(access.roles).map((role) => (
                  <span className="role-pill" key={role}>
                    {role}
                  </span>
                ))}
              </div>
            </div>
            <div className="cluster">
              <Link
                className="btn btn-secondary"
                href={`/workspaces/${workspaceId}/settings`}
              >
                Workspace settings
              </Link>
              {isManager(access.roles) ? (
                <Link
                  className="btn btn-primary"
                  href={`/workspaces/${workspaceId}/projects/new`}
                >
                  New project
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="stat">
            <span className="stat-value">{overview.projects.length}</span>
            <span className="stat-label">Projects</span>
          </div>
          <div className="stat">
            <span className="stat-value">{overview.workspace._count.memberships}</span>
            <span className="stat-label">Members</span>
          </div>
          <div className="stat">
            <span className="stat-value">{myAssigned}</span>
            <span className="stat-label">Your active tasks</span>
          </div>
        </div>

        <section className="stack">
          <div className="spread">
            <div>
              <p className="eyebrow">Project catalogue</p>
              <h2 className="display-sm">Current work</h2>
            </div>
            <p className="small muted">
              Owner: {overview.workspace.owner.displayName} · Opened{" "}
              {formatDate(overview.workspace.createdAt)}
            </p>
          </div>

          {overview.projects.length === 0 ? (
            <EmptyState
              title="No projects in this workspace"
              body={
                isManager(access.roles)
                  ? "Create a project, import a dataset, and pin an annotation schema."
                  : "A manager or owner needs to create the first project."
              }
              actionHref={
                isManager(access.roles)
                  ? `/workspaces/${workspaceId}/projects/new`
                  : undefined
              }
              actionLabel={isManager(access.roles) ? "Create project" : undefined}
            />
          ) : (
            <div className="grid-2">
              {overview.projects.map((project) => {
                const totalTasks = project._count.tasks;
                const accepted = (project.statusCounts.ACCEPTED ?? 0) + (project.statusCounts.RESOLVED ?? 0);
                const completion = totalTasks === 0 ? null : accepted / totalTasks;
                const latestVersion = project.dataset?.versions[0];
                return (
                  <Link
                    className="workspace-card"
                    key={project.id}
                    href={`/workspaces/${workspaceId}/projects/${project.id}`}
                  >
                    <div className="spread">
                      <div>
                        <p className="eyebrow">Project</p>
                        <h2>{project.name}</h2>
                      </div>
                      <StatusBadge status={project.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE"} />
                    </div>
                    <p className="small muted">
                      {project.description || "No description yet."}
                    </p>
                    <div className="meta-row">
                      <span>{project.annotationMode === "MULTI" ? "Multi-annotator" : "Single annotator"}</span>
                      <span>{pluralize(totalTasks, "task")}</span>
                      <span>{project._count.schemaVersions} schemas</span>
                      <span>{project._count.releases} releases</span>
                      {project.myAssignedCount > 0 ? (
                        <span>
                          <strong>{project.myAssignedCount}</strong> for you
                        </span>
                      ) : null}
                    </div>
                    <div className="stack" style={{ gap: "0.35rem" }}>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${(completion ?? 0) * 100}%` }}
                        />
                      </div>
                      <p className="tiny muted">
                        {completion === null
                          ? "No tasks generated yet."
                          : `${accepted} of ${totalTasks} tasks accepted or resolved.`}
                      </p>
                    </div>
                    <p className="tiny muted">
                      {latestVersion
                        ? `Dataset v${latestVersion.versionNumber} · ${latestVersion.recordCount} records · ${formatDate(latestVersion.createdAt)}`
                        : "No dataset committed yet."}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="panel panel-pad spread">
          <div>
            <p className="eyebrow">Governance</p>
            <p className="small">
              {isOwner(access.roles)
                ? "You own this workspace. Membership, quotas, audit events, and deletion controls are in settings."
                : "Membership and audit controls are managed by the workspace owner."}
            </p>
          </div>
          <Link
            className="btn btn-secondary btn-sm"
            href={`/workspaces/${workspaceId}/settings`}
          >
            Open settings
          </Link>
        </div>
      </div>
    </main>
  );
}
