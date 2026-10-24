import { assertSameOrigin, apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/auth/session";
import { beginReview } from "@/services/review";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const result = await beginReview({ user, annotationId: id });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
