import type { Metadata } from "next";
import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/WorkspaceForms";
import { EmptyState } from "@/components/EmptyState";
import { requirePageUser } from "@/auth/session";
import { roleLabels } from "@/auth/permissions";
import { listWorkspacesForUser } from "@/services/workspaces";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Workspaces",
};

export default async function WorkspacesPage() {
  const user = await requirePageUser("/workspaces");
  const workspaces = await listWorkspacesForUser(user.id);

  return (
    <main id="main-content" className="page">
      <div className="container stack-lg">
        <div className="page-intro">
          <div>
            <p className="eyebrow">Your account</p>
            <h1>Workspaces</h1>
            <p className="intro-meta">
              <span>{user.displayName}</span>
              <span>{user.email}</span>
              <span>
                {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div className="split">
            <EmptyState
              title="Open your first workspace"
              body="A workspace holds projects, members, datasets, and the audit trail for its releases. Create one to begin."
            />
            <div className="card card-pad stack">
              <p className="eyebrow">New workspace</p>
              <h2 className="display-sm">Name the work</h2>
              <CreateWorkspaceForm />
            </div>
          </div>
        ) : (
          <>
            <div className="workspace-list">
              {workspaces.map((item, index) => (
                <Link
                  className="workspace-card workspace-row"
                  href={`/workspaces/${item.workspace.id}`}
                  key={item.workspace.id}
                >
                  <div className="workspace-identity">
                    <p className="eyebrow">
                      Workspace / {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2>{item.workspace.name}</h2>
                    <div className="role-pills">
                      {roleLabels(item.roles).map((role) => (
                        <span className="role-pill" key={role}>
                          {role}
                        </span>
                      ))}
                    </div>
                    <p className="mono tiny muted">
                      {item.workspace.slug} / opened{" "}
                      {formatDate(item.workspace.createdAt)}
                    </p>
                  </div>
                  <div className="workspace-stats">
                    <div className="workspace-stat">
                      <strong>{item.projectCount}</strong>
                      <span>Projects</span>
                    </div>
                    <div className="workspace-stat">
                      <strong>{item.memberCount}</strong>
                      <span>Members</span>
                    </div>
                    <div className="workspace-stat">
                      <strong>{item.assignedTaskCount}</strong>
                      <span>Assigned to you</span>
                    </div>
                  </div>
                  <span className="workspace-open">
                    Open <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))}
            </div>

            <div className="split">
              <div className="stack">
                <p className="eyebrow">Access</p>
                <h2 className="display-sm">Roles are scoped to each workspace</h2>
                <p className="small muted">
                  Owner controls membership and deletion. Managers administer
                  projects, imports, assignments, and releases. Reviewers decide
                  reviews and adjudicate. Annotators work only on assigned tasks.
                  A member can hold more than one role.
                </p>
                <div className="spec-list" style={{ marginTop: "0.75rem" }}>
                  <div className="spec-row">
                    <span>Owner</span>
                    <strong>Membership / deletion</strong>
                  </div>
                  <div className="spec-row">
                    <span>Manager</span>
                    <strong>Projects / releases</strong>
                  </div>
                  <div className="spec-row">
                    <span>Reviewer</span>
                    <strong>Decisions / adjudication</strong>
                  </div>
                  <div className="spec-row">
                    <span>Annotator</span>
                    <strong>Assigned tasks</strong>
                  </div>
                </div>
              </div>
              <div className="card card-pad stack">
                <p className="eyebrow">Create another workspace</p>
                <h2 className="display-sm">Separate the work</h2>
                <CreateWorkspaceForm />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
