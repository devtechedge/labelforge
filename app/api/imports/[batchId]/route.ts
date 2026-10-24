import { apiOk, handleApiError } from "@/lib/api";
import { requireBatchApi } from "@/repositories/api-access";
import { getImportBatch } from "@/services/imports";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    const access = await requireBatchApi(batchId);
    const batch = await getImportBatch(access.user, batchId, access.workspaceId);
    return apiOk({ batch });
  } catch (error) {
    return handleApiError(error);
  }
}
