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
        <div className="spread">
          <div className="stack">
            <p className="eyebrow">Your account</p>
            <h1 className="display-md">Workspaces</h1>
            <p className="muted small">
              Signed in as {user.displayName} ({user.email}).
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
            <div className="grid-2">
              {workspaces.map((item) => (
                <Link
                  className="workspace-card"
                  href={`/workspaces/${item.workspace.id}`}
                  key={item.workspace.id}
                >
                  <div className="spread">
                    <div>
                      <p className="eyebrow">Workspace</p>
                      <h2>{item.workspace.name}</h2>
                    </div>
                    <span className="mono tiny">{item.workspace.slug}</span>
                  </div>
                  <div className="role-pills">
                    {roleLabels(item.roles).map((role) => (
                      <span className="role-pill" key={role}>
                        {role}
                      </span>
                    ))}
                  </div>
                  <div className="meta-row">
                    <span>
                      <strong>{item.projectCount}</strong> projects
                    </span>
                    <span>
                      <strong>{item.memberCount}</strong> members
                    </span>
                    <span>
                      <strong>{item.assignedTaskCount}</strong> tasks assigned to you
                    </span>
                    <span>Opened {formatDate(item.workspace.createdAt)}</span>
                  </div>
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
              </div>
              <div className="card card-pad stack">
                <p className="eyebrow">Create another workspace</p>
                <CreateWorkspaceForm />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
