import { apiOk, handleApiError } from "@/lib/api";
import { requireProjectApi } from "@/repositories/api-access";
import { getProjectOverview } from "@/services/projects";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectApi(id);
    const overview = await getProjectOverview(access.project.id);
    return apiOk({
      project: access.project,
      roles: access.roles,
      overview,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
