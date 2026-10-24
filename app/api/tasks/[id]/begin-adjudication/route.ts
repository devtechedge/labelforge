import { assertSameOrigin, apiOk, handleApiError } from "@/lib/api";
import { requireTaskApi } from "@/repositories/api-access";
import { beginAdjudication } from "@/services/review";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireTaskApi(id);
    const result = await beginAdjudication({
      user: access.user,
      workspaceId: access.task.workspaceId,
      projectId: access.task.projectId,
      taskId: id,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
