import { forbidden } from "@/lib/errors";
import { apiOk, handleApiError } from "@/lib/api";
import { requireWorkspaceApi } from "@/auth/session";
import { isManager } from "@/auth/permissions";
import { listAuditEvents } from "@/services/audit";
import { LIMITS } from "@/domain/limits";
import { paginationSchema, workspaceQuerySchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { workspaceId } = workspaceQuerySchema.parse({
      workspaceId: url.searchParams.get("workspaceId"),
    });
    const access = await requireWorkspaceApi(workspaceId);
    if (!isManager(access.roles)) {
      throw forbidden("Only owners and managers can read the audit log.");
    }

    const page = paginationSchema.parse({
      page: url.searchParams.get("page") ?? 1,
      limit: url.searchParams.get("limit") ?? LIMITS.auditPerPage,
    });
    const result = await listAuditEvents({
      workspaceId,
      page: page.page,
      limit: Math.min(page.limit, LIMITS.auditPerPage),
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
