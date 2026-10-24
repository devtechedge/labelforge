import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { reassignTasks } from "@/services/tasks";
import { reassignmentSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, reassignmentSchema);
    const result = await reassignTasks({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      taskIds: data.taskIds,
      userId: data.userId,
      ...(data.fromUserId ? { fromUserId: data.fromUserId } : {}),
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
