import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireTaskApi } from "@/repositories/api-access";
import { adjudicateTask } from "@/services/review";
import { adjudicationSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireTaskApi(id);
    const { data } = await readJson(request, adjudicationSchema);
    const result = await adjudicateTask({
      user: access.user,
      workspaceId: access.task.workspaceId,
      projectId: access.task.projectId,
      taskId: id,
      finalAnswer: data.finalAnswer,
      rationale: data.rationale,
      expectedTaskVersion: data.expectedTaskVersion,
      chosenAnnotationId: data.chosenAnnotationId ?? null,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
