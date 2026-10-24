import type { WorkspaceRole } from "@/generated/prisma/enums";

export function isOwner(roles: WorkspaceRole[]): boolean {
  return roles.includes("OWNER");
}

export function isManager(roles: WorkspaceRole[]): boolean {
  return isOwner(roles) || roles.includes("MANAGER");
}

export function canReview(roles: WorkspaceRole[]): boolean {
  return isOwner(roles) || roles.includes("REVIEWER");
}

export function canAdjudicate(roles: WorkspaceRole[]): boolean {
  return isOwner(roles) || roles.includes("MANAGER") || roles.includes("REVIEWER");
}

export function canAnnotate(roles: WorkspaceRole[]): boolean {
  return roles.includes("ANNOTATOR");
}

export function canAdministerWorkspace(roles: WorkspaceRole[]): boolean {
  return isOwner(roles);
}

export function roleLabels(roles: WorkspaceRole[]): string[] {
  return roles.map((role) => role.charAt(0) + role.slice(1).toLowerCase());
}

export function assignableInviteRoles(): WorkspaceRole[] {
  return ["MANAGER", "REVIEWER", "ANNOTATOR"];
}
