import { assertSameOrigin, handleApiError, apiOk, readJson } from "@/lib/api";
import { requireApiUser } from "@/auth/session";
import { createWorkspace, listWorkspacesForUser } from "@/services/workspaces";
import { workspaceCreateSchema } from "@/validation/requests";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    const workspaces = await listWorkspacesForUser(user.id);
    return apiOk({ workspaces });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { data } = await readJson(request, workspaceCreateSchema);
    const workspace = await createWorkspace(user, data.name);
    return apiOk(
      {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
