"use server";

import { redirect } from "next/navigation";

import type { FormActionState } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getCurrentUser, getWorkspaceAccess } from "@/auth/session";
import { isOwner } from "@/auth/permissions";
import { isAppError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import {
  acceptInvitation,
  createInvitation,
  createWorkspace,
  deleteWorkspace,
  removeMember,
  renameWorkspace,
  revokeInvitation,
  updateMemberRoles,
} from "@/services/workspaces";
import {
  emailSchema,
  workspaceNameSchema,
} from "@/validation/requests";
import type { WorkspaceRole } from "@/generated/prisma/enums";

function errorState(error: unknown): FormActionState {
  if (isAppError(error)) return { error: error.message };
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Check the submitted fields." };
  }
  console.error("Workspace action failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return { error: "Something went wrong. Try again." };
}

function parseRoles(formData: FormData): WorkspaceRole[] {
  return formData
    .getAll("roles")
    .map(String)
    .filter((role): role is WorkspaceRole =>
      ["MANAGER", "REVIEWER", "ANNOTATOR"].includes(role),
    );
}

export async function createWorkspaceAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let workspaceId: string;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in to create a workspace." };
    const name = workspaceNameSchema.parse(String(formData.get("name") ?? ""));
    const workspace = await createWorkspace(user, name);
    workspaceId = workspace.id;
    revalidatePath("/workspaces");
  } catch (error) {
    return errorState(error);
  }
  redirect(`/workspaces/${workspaceId}`);
}

export async function inviteMemberAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in to invite members." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    const email = emailSchema.parse(String(formData.get("email") ?? ""));
    const roles = parseRoles(formData);
    if (roles.length === 0) return { error: "Choose at least one role." };
    await enforceRateLimit("invitation:workspace", workspaceId, RATE_LIMITS.invitation);

    const { token } = await createInvitation({
      actor: access.user,
      workspaceId,
      rolesOfActor: access.roles,
      email,
      roles,
    });
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return {
      message: `Invitation created for ${email}. Share the link shown below.`,
      inviteUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/invite/${token}`,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeInvitationAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const invitationId = String(formData.get("invitationId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    await revokeInvitation({
      workspaceId,
      invitationId,
      actorId: user.id,
      rolesOfActor: access.roles,
    });
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { message: "Invitation revoked." };
  } catch (error) {
    return errorState(error);
  }
}

export async function acceptInvitationAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let workspaceId: string;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in to accept this invitation." };
    const token = String(formData.get("token") ?? "");
    await enforceRateLimit("invitation:accept", user.id, RATE_LIMITS.invitationAccept);
    const result = await acceptInvitation({ user, token });
    workspaceId = result.workspaceId;
    revalidatePath("/workspaces");
  } catch (error) {
    return errorState(error);
  }
  redirect(`/workspaces/${workspaceId}`);
}

export async function updateMemberRolesAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const membershipId = String(formData.get("membershipId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    const roles = parseRoles(formData);
    if (roles.length === 0) return { error: "Choose at least one role." };
    await updateMemberRoles({
      workspaceId,
      membershipId,
      roles,
      actorId: user.id,
      rolesOfActor: access.roles,
    });
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { message: "Member roles updated." };
  } catch (error) {
    return errorState(error);
  }
}

export async function removeMemberAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const membershipId = String(formData.get("membershipId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    await removeMember({
      workspaceId,
      membershipId,
      actorId: user.id,
      rolesOfActor: access.roles,
    });
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { message: "Member removed. Their annotation history is preserved." };
  } catch (error) {
    return errorState(error);
  }
}

export async function renameWorkspaceAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    const name = workspaceNameSchema.parse(String(formData.get("name") ?? ""));
    await renameWorkspace({
      workspaceId,
      name,
      actorId: user.id,
      rolesOfActor: access.roles,
    });
    revalidatePath("/workspaces");
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { message: "Workspace renamed." };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteWorkspaceAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let deleted = false;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Sign in first." };
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const access = await getWorkspaceAccess(workspaceId, user);
    if (!access) return { error: "Workspace not found." };
    if (!isOwner(access.roles)) {
      return { error: "Only the workspace owner can delete it." };
    }
    await deleteWorkspace({
      workspaceId,
      confirmation,
      actorId: user.id,
      rolesOfActor: access.roles,
    });
    deleted = true;
  } catch (error) {
    return errorState(error);
  }
  if (deleted) {
    revalidatePath("/workspaces");
    redirect("/workspaces");
  }
  return { error: "Workspace could not be deleted." };
}
