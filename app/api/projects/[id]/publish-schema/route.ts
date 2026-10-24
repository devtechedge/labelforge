import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { publishSchemaVersion } from "@/services/schemas";
import { schemaPublishSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, schemaPublishSchema);
    const schema = await publishSchemaVersion({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      schemaVersionId: data.schemaVersionId,
    });
    return apiOk({
      schema: { id: schema.id, versionNumber: schema.versionNumber, status: schema.status },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
