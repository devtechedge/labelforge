import { assertSameOrigin, apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/auth/session";
import { enforceRateLimit, RATE_LIMITS, requestIp } from "@/lib/rate-limit";
import { acceptInvitation } from "@/services/workspaces";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { token } = await params;
    await enforceRateLimit(
      "invitation:accept",
      `${requestIp(request)}:${user.id}`,
      RATE_LIMITS.invitationAccept,
    );
    const result = await acceptInvitation({ user, token });
    return apiOk({ workspaceId: result.workspaceId });
  } catch (error) {
    return handleApiError(error);
  }
}
