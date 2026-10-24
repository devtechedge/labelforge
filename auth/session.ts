import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound as notFoundPage, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { AppError, forbidden, notFound as notFoundError } from "@/lib/errors";
import { hashOpaqueToken, newOpaqueToken } from "@/auth/tokens";
import { isManager, canReview, canAnnotate } from "@/auth/permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "labelforge_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export async function createSession(userId: string): Promise<void> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      tokenHash: hashOpaqueToken(token),
      userId,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    session.user.disabledAt
  ) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
  };
});

export async function requirePageUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const suffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${suffix}`);
  }
  return user;
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }
  return user;
}

export type WorkspaceAccess = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    status: "ACTIVE" | "ARCHIVED";
  };
  membershipId: string;
  roles: WorkspaceRole[];
  user: SessionUser;
};

export async function getWorkspaceAccess(
  workspaceId: string,
  user?: SessionUser | null,
): Promise<WorkspaceAccess | null> {
  const currentUser = user === undefined ? await getCurrentUser() : user;
  if (!currentUser) return null;

  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    include: { workspace: true },
  });

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.workspace.status !== "ACTIVE"
  ) {
    return null;
  }

  return {
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      ownerId: membership.workspace.ownerId,
      status: membership.workspace.status,
    },
    membershipId: membership.id,
    roles: membership.roles,
    user: currentUser,
  };
}

export async function requireWorkspacePage(
  workspaceId: string,
  check: (roles: WorkspaceRole[]) => boolean = () => true,
): Promise<WorkspaceAccess> {
  const user = await requirePageUser(`/workspaces/${workspaceId}`);
  const access = await getWorkspaceAccess(workspaceId, user);
  if (!access) notFoundPage();
  if (!check(access.roles)) {
    redirect(`/workspaces/${workspaceId}?denied=1`);
  }
  return access;
}

export async function requireWorkspaceApi(
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const user = await requireApiUser();
  const access = await getWorkspaceAccess(workspaceId, user);
  if (!access) throw notFoundError("Workspace not found.");
  return access;
}

export function assertCanManage(roles: WorkspaceRole[]): void {
  if (!isManager(roles)) {
    throw forbidden("Only workspace owners and managers can do that.");
  }
}

export function assertCanReview(roles: WorkspaceRole[]): void {
  if (!canReview(roles)) {
    throw forbidden("Only reviewers and owners can decide reviews.");
  }
}

export function assertCanAnnotate(roles: WorkspaceRole[]): void {
  if (!canAnnotate(roles)) {
    throw forbidden("Only annotators can save annotation work.");
  }
}
