import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { commitImport } from "@/services/imports";
import { importCommitSchema } from "@/validation/requests";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, importCommitSchema);
    const result = await commitImport({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: access.project.id,
      roles: access.roles,
      batchId: data.batchId,
    });
    return apiOk({ version: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
