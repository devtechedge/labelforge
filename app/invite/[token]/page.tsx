import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/AuthShell";
import { AcceptInviteForm } from "@/components/AuthForms";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/auth/session";
import { roleLabels } from "@/auth/permissions";
import { getInvitationPreview } from "@/services/workspaces";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Workspace invitation",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getInvitationPreview(token);

  if (!preview) {
    return (
      <AuthShell>
        <p className="eyebrow">Invitation</p>
        <h1>This link is not available</h1>
        <p className="muted">
          The invitation may have been revoked, replaced, or mistyped. Ask the
          workspace owner for a fresh link.
        </p>
        <Link className="btn btn-secondary" href="/login">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  const { invitation, expired } = preview;
  const unavailable =
    expired || invitation.status !== "PENDING" || invitation.workspace.status !== "ACTIVE";
  const user = await getCurrentUser();
  const matchesUser = user?.email === invitation.email;
  const next = `/invite/${token}`;

  return (
    <AuthShell>
      <div className="stack">
        <p className="eyebrow">Workspace invitation</p>
        <h1>Join {invitation.workspace.name}</h1>
        <p className="muted small">
          {invitation.inviter.displayName} invited {invitation.email} with the{" "}
          {roleLabels(invitation.roles).join(" and ")} role
          {invitation.roles.length > 1 ? "s" : ""}. The link expires{" "}
          {formatDateTime(invitation.expiresAt)}.
        </p>
      </div>

      {unavailable ? (
        <div className="notice notice-warning">
          This invitation is no longer open. Ask the workspace owner to send a
          new one.
        </div>
      ) : !user ? (
        <div className="stack">
          <div className="notice">
            Sign in or create an account with <strong>{invitation.email}</strong>{" "}
            to accept. The invitation only works for that address.
          </div>
          <div className="cluster">
            <Link
              className="btn btn-primary"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Sign in
            </Link>
            <Link
              className="btn btn-secondary"
              href={`/signup?next=${encodeURIComponent(next)}`}
            >
              Create account
            </Link>
          </div>
        </div>
      ) : !matchesUser ? (
        <div className="stack">
          <div className="notice notice-warning">
            You are signed in as {user.email}, but this invitation was sent to{" "}
            {invitation.email}. Sign out and use the invited address.
          </div>
          <form action={logoutAction}>
            <button className="btn btn-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <div className="stack">
          <div className="notice">
            You are signed in as {user.email}. Joining adds this workspace to your
            account.
          </div>
          <AcceptInviteForm token={token} />
        </div>
      )}
    </AuthShell>
  );
}
