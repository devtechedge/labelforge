import { apiOk, handleApiError } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { getProjectQuality } from "@/services/quality";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireProjectApi(id);
    const quality = await getProjectQuality(id);
    return apiOk({ quality });
  } catch (error) {
    return handleApiError(error);
  }
}
