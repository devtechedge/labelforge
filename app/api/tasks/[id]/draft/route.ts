import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireTaskApi } from "@/repositories/api-access";
import { saveDraft } from "@/services/tasks";
import { draftSaveSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireTaskApi(id);
    const { data } = await readJson(request, draftSaveSchema);
    const result = await saveDraft({
      user: access.user,
      workspaceId: access.task.workspaceId,
      projectId: access.task.projectId,
      taskId: id,
      answer: data.answer,
      expectedRevision: data.expectedRevision,
    });
    return apiOk({ annotation: result });
  } catch (error) {
    return handleApiError(error);
  }
}
