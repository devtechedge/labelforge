import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { listReleases, publishRelease } from "@/services/releases";
import { paginationSchema, releaseCreateSchema } from "@/validation/requests";
import { LIMITS } from "@/domain/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireProjectApi(id);
    const url = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: url.searchParams.get("page") ?? 1,
      limit: url.searchParams.get("limit") ?? LIMITS.releasesPerPage,
    });
    const result = await listReleases(id, pagination.page);
    return apiOk({
      ...result,
      page: pagination.page,
      pageSize: LIMITS.releasesPerPage,
      pageCount: Math.max(1, Math.ceil(result.total / LIMITS.releasesPerPage)),
    });
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
