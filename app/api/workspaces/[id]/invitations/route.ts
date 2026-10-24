import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireWorkspaceApi } from "@/auth/session";
import { env } from "@/lib/env";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createInvitation } from "@/services/workspaces";
import { invitationCreateSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireWorkspaceApi(id);
    await enforceRateLimit("invitation:workspace", id, RATE_LIMITS.invitation);
    const { data } = await readJson(request, invitationCreateSchema);
    const { invitation, token } = await createInvitation({
      actor: access.user,
      workspaceId: id,
      rolesOfActor: access.roles,
      email: data.email,
      roles: data.roles,
    });

    return apiOk(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          roles: invitation.roles,
          expiresAt: invitation.expiresAt,
        },
        inviteUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/invite/${token}`,
        note: "The invite link is shown once. No email delivery is configured on this deployment.",
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
