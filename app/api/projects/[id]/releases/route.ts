import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { listReleases, publishRelease } from "@/services/releases";
import { releaseCreateSchema } from "@/validation/requests";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireProjectApi(id);
    const result = await listReleases(id);
    return apiOk(result);
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
    const { data } = await readJson(request, releaseCreateSchema);
    const result = await publishRelease({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      schemaVersionId: data.schemaVersionId,
      datasetVersionId: data.datasetVersionId,
      notes: data.notes,
    });
    return apiOk({ release: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
