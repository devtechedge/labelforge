import { assertSameOrigin, apiOk, handleApiError, readJson } from "@/lib/api";
import { requireWorkspaceApi } from "@/auth/session";
import { createProject } from "@/services/projects";
import { projectCreateSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { data } = await readJson(request, projectCreateSchema);
    const access = await requireWorkspaceApi(data.workspaceId);
    const project = await createProject({
      user: access.user,
      workspaceId: data.workspaceId,
      roles: access.roles,
      name: data.name,
      description: data.description,
      annotationMode: data.annotationMode,
      annotationsPerTask: data.annotationsPerTask,
    });
    return apiOk({ project: { id: project.id, name: project.name } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
