import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { generateTasks } from "@/services/schemas";
import { taskGenerationSchema } from "@/validation/requests";

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
    const { data } = await readJson(request, taskGenerationSchema);
    const result = await generateTasks({
      user: access.user,
      workspaceId: access.project.workspaceId,
      projectId: id,
      roles: access.roles,
      schemaVersionId: data.schemaVersionId,
      datasetVersionId: data.datasetVersionId,
    });
    return apiOk(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
