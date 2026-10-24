import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { createSchemaVersion, listSchemaVersions } from "@/services/schemas";
import { schemaCreateSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireProjectApi(id);
    const schemas = await listSchemaVersions(id);
    return apiOk({ schemas });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const access = await requireProjectApi(id);
    const { data } = await readJson(request, schemaCreateSchema);
    const schema = await createSchemaVersion({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      schema: data.schema,
    });
    return apiOk({ schema: { id: schema.id, versionNumber: schema.versionNumber, status: schema.status } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
