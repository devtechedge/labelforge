import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DeleteWorkspaceForm,
  InviteMemberForm,
  MemberRoleForm,
  RemoveMemberForm,
  RenameWorkspaceForm,
} from "@/components/WorkspaceForms";
import { RevokeInvitationForm } from "@/components/InvitationForms";
import { getWorkspaceAccess, requirePageUser } from "@/auth/session";
import { isManager, isOwner, roleLabels } from "@/auth/permissions";
import {
  getWorkspaceQuotaUsage,
  listMembers,
  listPendingInvitations,
} from "@/services/workspaces";
import { listAuditEvents } from "@/services/audit";
import { LIMITS } from "@/domain/limits";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Workspace settings",
};

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ auditPage?: string }>;
}) {
  const user = await requirePageUser();
  const { workspaceId } = await params;
  const query = await searchParams;
  const access = await getWorkspaceAccess(workspaceId, user);
  if (!access) notFound();

  const owner = isOwner(access.roles);
  const manager = isManager(access.roles);
  const auditPage = Math.max(1, Number(query.auditPage ?? "1") || 1);

  const [members, invitations, quotas, audit] = await Promise.all([
    listMembers(workspaceId),
    owner ? listPendingInvitations(workspaceId) : Promise.resolve([]),
    getWorkspaceQuotaUsage(workspaceId, user.id),
    manager
      ? listAuditEvents({
          workspaceId,
          page: auditPage,
          limit: LIMITS.auditPerPage,
        })
      : Promise.resolve({ events: [], total: 0 }),
  ]);

  const auditPageCount = Math.max(1, Math.ceil(audit.total / LIMITS.auditPerPage));

  return (
    <main id="main-content" className="page">
      <div className="container stack-lg">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/workspaces">Workspaces</Link>
          <span className="sep">/</span>
          <Link href={`/workspaces/${workspaceId}`}>{access.workspace.name}</Link>
          <span className="sep">/</span>
          <span>Settings</span>
        </nav>

        <div className="stack">
          <p className="eyebrow">Workspace administration</p>
          <h1 className="display-md">Membership, quotas, and audit</h1>
          <p className="muted small">
            Your roles: {roleLabels(access.roles).join(", ")}.
          </p>
        </div>

        <div className="grid-2">
          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Members</p>
                <h2 className="display-sm">{members.length} active</h2>
              </div>
            </div>
            <div className="member-list">
              {members.map((membership) => {
                const memberIsOwner = membership.roles.includes("OWNER");
                return (
                  <div className="member-row" key={membership.id}>
                    <div className="stack" style={{ gap: "0.2rem" }}>
                      <strong>
                        {membership.user.displayName}
                        {membership.userId === user.id ? " (you)" : ""}
                      </strong>
                      <span className="small muted">{membership.user.email}</span>
                      <div className="role-pills">
                        {roleLabels(membership.roles).map((role) => (
                          <span className="role-pill" key={role}>
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                    {owner && !memberIsOwner ? (
                      <div className="cluster" style={{ alignItems: "flex-start" }}>
                        <MemberRoleForm
                          workspaceId={workspaceId}
                          membershipId={membership.id}
                          roles={membership.roles}
                        />
                        <RemoveMemberForm
                          workspaceId={workspaceId}
                          membershipId={membership.id}
                          name={membership.user.displayName}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!owner ? (
              <p className="notice notice-warning small">
                Only the workspace owner can invite, change roles, or remove
                members.
              </p>
            ) : null}
          </section>

          <section className="stack">
            {owner ? (
              <div className="card card-pad stack">
                <div>
                  <p className="eyebrow">Invite</p>
                  <h2 className="display-sm">Add a teammate</h2>
                </div>
                <InviteMemberForm workspaceId={workspaceId} />
              </div>
            ) : null}

            {owner && invitations.length > 0 ? (
              <div className="card card-pad stack">
                <p className="eyebrow">Pending invitations</p>
                <div className="member-list">
                  {invitations.map((invitation) => (
                    <div className="member-row" key={invitation.id}>
                      <div className="stack" style={{ gap: "0.2rem" }}>
                        <strong>{invitation.email}</strong>
                        <span className="small muted">
                          {roleLabels(invitation.roles).join(", ")} · expires{" "}
                          {formatDateTime(invitation.expiresAt)}
                        </span>
                      </div>
                      <RevokeInvitationForm
                        workspaceId={workspaceId}
                        invitationId={invitation.id}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card card-pad stack">
              <p className="eyebrow">Quotas</p>
              <ul className="limit-list">
                <li>
                  <span>Members</span>
                  <strong>
                    {quotas.memberCount} / {LIMITS.membersPerWorkspace}
                  </strong>
                </li>
                <li>
                  <span>Projects</span>
                  <strong>
                    {quotas.projectCount} / {LIMITS.projectsPerWorkspace}
                  </strong>
                </li>
                <li>
                  <span>Workspaces for you</span>
                  <strong>
                    {quotas.userWorkspaceCount} / {LIMITS.workspacesPerUser}
                  </strong>
                </li>
                <li>
                  <span>File upload</span>
                  <strong>{LIMITS.fileBytes / (1024 * 1024)} MB</strong>
                </li>
                <li>
                  <span>Rows per import</span>
                  <strong>{LIMITS.recordsPerImport.toLocaleString()}</strong>
                </li>
              </ul>
            </div>
          </section>
        </div>

        {manager ? (
          <section className="card card-pad stack">
            <div className="spread">
              <div>
                <p className="eyebrow">Audit log</p>
                <h2 className="display-sm">Who changed what</h2>
              </div>
              <p className="small muted">{audit.total} events</p>
            </div>
            {audit.events.length === 0 ? (
              <p className="muted small">No audit events recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Workspace audit events</caption>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Action</th>
                      <th scope="col">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.events.map((event) => (
                      <tr key={event.id}>
                        <td className="mono tiny">
                          {formatDateTime(event.createdAt)}
                        </td>
                        <td>{event.actor?.displayName ?? "System"}</td>
                        <td className="mono tiny">{event.action}</td>
                        <td className="mono tiny">
                          {event.targetType}
                          {event.targetId ? ` · ${event.targetId.slice(0, 8)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <span>
                Page {auditPage} of {auditPageCount}
              </span>
              <div className="cluster">
                {auditPage > 1 ? (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`?auditPage=${auditPage - 1}`}
                  >
                    Newer
                  </Link>
                ) : null}
                {auditPage < auditPageCount ? (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`?auditPage=${auditPage + 1}`}
                  >
                    Older
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {owner ? (
          <section className="card card-pad stack-lg">
            <div className="stack">
              <p className="eyebrow">Owner controls</p>
              <h2 className="display-sm">Workspace identity and deletion</h2>
            </div>
            <div className="grid-2">
              <div className="stack">
                <p className="field-label">Rename workspace</p>
                <RenameWorkspaceForm
                  workspaceId={workspaceId}
                  name={access.workspace.name}
                />
              </div>
              <div className="stack">
                <p className="field-label">Delete workspace</p>
                <p className="small muted">
                  Permanently removes projects, datasets, annotations, releases,
                  and audit events. This cannot be undone.
                </p>
                <DeleteWorkspaceForm
                  workspaceId={workspaceId}
                  slug={access.workspace.slug}
                />
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
