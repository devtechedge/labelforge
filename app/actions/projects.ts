"use server";

import { redirect } from "next/navigation";

import type { FormActionState } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getCurrentUser, getWorkspaceAccess } from "@/auth/session";
import { isAppError } from "@/lib/errors";
import {
  createProject,
  deleteProject,
  setProjectArchived,
  updateProject,
} from "@/services/projects";
import {
  projectCreateSchema,
  projectDescriptionSchema,
  projectNameSchema,
} from "@/validation/requests";

function projectError(error: unknown): FormActionState {
  if (isAppError(error)) return { error: error.message };
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Check the submitted fields." };
  }
  console.error("Project action failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return { error: "Something went wrong. Try again." };
}

export async function createProjectAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let projectId: string;
  let workspaceId: string;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in to create a project." };
    workspaceId = String(formData.get("workspaceId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };

    const data = projectCreateSchema.parse({
      workspaceId,
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      annotationMode: String(formData.get("annotationMode") ?? "SINGLE"),
      annotationsPerTask: Number(formData.get("annotationsPerTask") ?? 1),
    });

    const project = await createProject({
      user: access.user,
      workspaceId,
      roles: access.roles,
      name: data.name,
      description: data.description,
      annotationMode: data.annotationMode,
      annotationsPerTask: data.annotationsPerTask,
    });
    projectId = project.id;
    revalidatePath(`/workspaces/${workspaceId}`);
  } catch (error) {
    return projectError(error);
  }
  redirect(`/workspaces/${workspaceId}/projects/${projectId}`);
}

export async function updateProjectAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };

    await updateProject({
      projectId,
      workspaceId,
      roles: access.roles,
      actorId: user.id,
      name: projectNameSchema.parse(String(formData.get("name") ?? "")),
      description: projectDescriptionSchema.parse(
        String(formData.get("description") ?? ""),
      ),
      annotationMode: String(formData.get("annotationMode") ?? "SINGLE") as
        | "SINGLE"
        | "MULTI",
      annotationsPerTask: Number(formData.get("annotationsPerTask") ?? 1),
    });
    revalidatePath(`/workspaces/${workspaceId}/projects/${projectId}`);
    revalidatePath(`/workspaces/${workspaceId}`);
    return { message: "Project settings updated." };
  } catch (error) {
    return projectError(error);
  }
}

export async function archiveProjectAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const archived = String(formData.get("archived") ?? "true") === "true";
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };

    await setProjectArchived({
      projectId,
      workspaceId,
      roles: access.roles,
      actorId: user.id,
      archived,
    });
    revalidatePath(`/workspaces/${workspaceId}/projects/${projectId}`);
    revalidatePath(`/workspaces/${workspaceId}`);
    return { message: archived ? "Project archived." : "Project restored." };
  } catch (error) {
    return projectError(error);
  }
}

export async function deleteProjectAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let target: string | null = null;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };

    await deleteProject({
      projectId,
      workspaceId,
      roles: access.roles,
      actorId: user.id,
      confirmation,
    });
    target = `/workspaces/${workspaceId}`;
    revalidatePath(target);
  } catch (error) {
    return projectError(error);
  }
  redirect(target);
}
