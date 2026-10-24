import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { applySchemaToUnstartedTasks } from "@/services/schemas";
import { schemaApplySchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, schemaApplySchema);
    const result = await applySchemaToUnstartedTasks({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      schemaVersionId: data.schemaVersionId,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
