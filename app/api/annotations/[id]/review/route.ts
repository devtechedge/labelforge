import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireApiUser } from "@/auth/session";
import { reviewAnnotation } from "@/services/review";
import { reviewSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const { data } = await readJson(request, reviewSchema);
    const result = await reviewAnnotation({
      user,
      annotationId: id,
      decision: data.decision,
      feedback: data.feedback,
      expectedRevision: data.expectedRevision,
      idempotencyKey: data.idempotencyKey,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
