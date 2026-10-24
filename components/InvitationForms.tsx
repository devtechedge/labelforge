"use client";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { revokeInvitationAction } from "@/app/actions/workspaces";

export function RevokeInvitationForm({
  workspaceId,
  invitationId,
}: {
  workspaceId: string;
  invitationId: string;
}) {
  return (
    <ActionForm action={revokeInvitationAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Revoking...">
        Revoke
      </SubmitButton>
    </ActionForm>
  );
}
