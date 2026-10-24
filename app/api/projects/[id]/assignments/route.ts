import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { assignTasks } from "@/services/tasks";
import { assignmentSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, assignmentSchema);
    const result = await assignTasks({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      taskIds: data.taskIds,
      userIds: data.userIds,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
