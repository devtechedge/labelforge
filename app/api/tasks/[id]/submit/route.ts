import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireTaskApi } from "@/repositories/api-access";
import { submitAnnotation } from "@/services/tasks";
import { submitSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireTaskApi(id);
    const { data } = await readJson(request, submitSchema);
    const result = await submitAnnotation({
      user: access.user,
      workspaceId: access.task.workspaceId,
      projectId: access.task.projectId,
      taskId: id,
      expectedRevision: data.expectedRevision,
      submissionKey: data.submissionKey,
    });
    return apiOk({ submission: result });
  } catch (error) {
    return handleApiError(error);
  }
}
