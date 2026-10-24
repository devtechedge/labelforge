import { apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/auth/session";
import { getNextTask } from "@/services/tasks";
import { idSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const workspaceIdRaw = url.searchParams.get("workspaceId");
    const projectIdRaw = url.searchParams.get("projectId");
    const workspaceId = workspaceIdRaw ? idSchema.parse(workspaceIdRaw) : undefined;
    const projectId = projectIdRaw ? idSchema.parse(projectIdRaw) : undefined;

    const task = await getNextTask({ user, workspaceId, projectId });
    return apiOk({
      task,
      message: task ? null : "No more eligible work is assigned to you.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
