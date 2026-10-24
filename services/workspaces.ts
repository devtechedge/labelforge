import "server-only";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/services/audit";
import { hashOpaqueToken, newOpaqueToken } from "@/auth/tokens";
import { isOwner } from "@/auth/permissions";
import { LIMITS } from "@/domain/limits";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";

function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return base || "workspace";
}

async function uniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createWorkspace(user: SessionUser, name: string) {
  const membershipCount = await prisma.membership.count({
    where: { userId: user.id, status: "ACTIVE" },
  });
  if (membershipCount >= LIMITS.workspacesPerUser) {
    throw conflict(
      `You can belong to ${LIMITS.workspacesPerUser} workspaces on this deployment.`,
    );
  }

  const slug = await uniqueWorkspaceSlug(name);
  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        name,
        slug,
        ownerId: user.id,
        memberships: {
          create: { userId: user.id, roles: ["OWNER"], status: "ACTIVE" },
        },
      },
    });
    await recordAudit(tx, {
      workspaceId: created.id,
      actorId: user.id,
      action: "workspace.created",
      targetType: "Workspace",
      targetId: created.id,
      metadata: { name: created.name },
    });
    return created;
  });

  return workspace;
}

export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE", workspace: { status: "ACTIVE" } },
    include: {
      workspace: {
        include: {
          _count: { select: { memberships: true, projects: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const assignedTasks =
    workspaceIds.length === 0
      ? []
      : await prisma.annotationTask.findMany({
          where: {
            project: { workspaceId: { in: workspaceIds } },
            assignments: { some: { userId, status: "ACTIVE" } },
            status: {
              notIn: ["ACCEPTED", "REJECTED", "RESOLVED", "DISPUTED"],
            },
          },
          select: { project: { select: { workspaceId: true } } },
        });

  const assignedByWorkspace = new Map<string, number>();
  for (const task of assignedTasks) {
    const id = task.project.workspaceId;
    assignedByWorkspace.set(id, (assignedByWorkspace.get(id) ?? 0) + 1);
  }

  return memberships.map((membership) => ({
    workspace: membership.workspace,
    roles: membership.roles,
    memberCount: membership.workspace._count.memberships,
    projectCount: membership.workspace._count.projects,
    assignedTaskCount: assignedByWorkspace.get(membership.workspaceId) ?? 0,
  }));
}

export async function getWorkspaceOverview(
  workspaceId: string,
  userId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      _count: { select: { memberships: true, projects: true } },
    },
  });
  if (!workspace) return null;

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      dataset: {
        include: {
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          _count: { select: { versions: true } },
        },
      },
      schemaVersions: {
        where: { status: "PUBLISHED" },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
      _count: { select: { tasks: true, schemaVersions: true, releases: true } },
    },
  });

  const projectIds = projects.map((project) => project.id);
  const statusCounts =
    projectIds.length === 0
      ? []
      : await prisma.annotationTask.groupBy({
          by: ["projectId", "status"],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        });

  const countsByProject = new Map<string, Record<string, number>>();
  for (const row of statusCounts) {
    const map = countsByProject.get(row.projectId) ?? {};
    map[row.status] = row._count._all;
    countsByProject.set(row.projectId, map);
  }

  const myAssignments = await prisma.taskAssignment.findMany({
    where: {
      userId,
      status: "ACTIVE",
      task: {
        project: { workspaceId },
        status: { notIn: ["ACCEPTED", "REJECTED", "RESOLVED", "DISPUTED"] },
      },
    },
    select: { task: { select: { projectId: true } } },
  });
  const myAssignmentsByProject = new Map<string, number>();
  for (const assignment of myAssignments) {
    const id = assignment.task.projectId;
    myAssignmentsByProject.set(id, (myAssignmentsByProject.get(id) ?? 0) + 1);
  }

  return {
    workspace,
    projects: projects.map((project) => ({
      ...project,
      statusCounts: countsByProject.get(project.id) ?? {},
      myAssignedCount: myAssignmentsByProject.get(project.id) ?? 0,
    })),
  };
}

export type InviteRole = Exclude<WorkspaceRole, "OWNER">;

export async function createInvitation(input: {
  actor: SessionUser;
  workspaceId: string;
  roles: WorkspaceRole[];
  rolesOfActor: WorkspaceRole[];
  email: string;
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can invite members.");
  }
  if (input.roles.includes("OWNER") || input.roles.length === 0) {
    throw conflict("Invitations cannot grant ownership.");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!workspace) throw notFound("Workspace not found.");
  if (workspace._count.memberships >= LIMITS.membersPerWorkspace) {
    throw conflict(
      `This workspace has reached its ${LIMITS.membersPerWorkspace}-member limit.`,
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      memberships: { where: { workspaceId: input.workspaceId } },
    },
  });
  if (
    existingUser?.memberships.some((membership) => membership.status === "ACTIVE")
  ) {
    throw conflict("That person is already a member of this workspace.");
  }

  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: {
        workspaceId: input.workspaceId,
        email: input.email,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });
    const created = await tx.invitation.create({
      data: {
        workspaceId: input.workspaceId,
        email: input.email,
        roles: input.roles,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        inviterId: input.actor.id,
      },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actor.id,
      action: "invitation.created",
      targetType: "Invitation",
      targetId: created.id,
      metadata: { email: input.email, roles: input.roles },
    });
    return created;
  });

  return { invitation, token };
}

export async function listPendingInvitations(workspaceId: string) {
  const now = new Date();
  await prisma.invitation.updateMany({
    where: { workspaceId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return prisma.invitation.findMany({
    where: { workspaceId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { inviter: { select: { displayName: true } } },
  });
}

export async function revokeInvitation(input: {
  workspaceId: string;
  invitationId: string;
  actorId: string;
  rolesOfActor: WorkspaceRole[];
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can revoke invitations.");
  }
  const invitation = await prisma.invitation.findFirst({
    where: { id: input.invitationId, workspaceId: input.workspaceId },
  });
  if (!invitation) throw notFound("Invitation not found.");

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "invitation.revoked",
      targetType: "Invitation",
      targetId: invitation.id,
    });
  });
}

export async function getInvitationPreview(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      workspace: { select: { name: true, slug: true, status: true } },
      inviter: { select: { displayName: true } },
    },
  });
  if (!invitation) return null;

  const expired =
    invitation.expiresAt.getTime() <= Date.now() || invitation.status === "EXPIRED";
  return { invitation, expired };
}

export async function acceptInvitation(input: {
  user: SessionUser;
  token: string;
}) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashOpaqueToken(input.token) },
    include: { workspace: true },
  });
  if (!invitation) throw notFound("This invitation link is not valid.");
  if (invitation.status !== "PENDING") {
    throw conflict("This invitation is no longer open.");
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    throw conflict("This invitation has expired.");
  }
  if (invitation.email !== input.user.email) {
    throw forbidden(
      `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
    );
  }
  if (invitation.workspace.status !== "ACTIVE") {
    throw conflict("This workspace is not active.");
  }

  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: input.user.id,
        },
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId: input.user.id,
        roles: invitation.roles,
        status: "ACTIVE",
      },
      update: {
        roles: invitation.roles,
        status: "ACTIVE",
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedById: input.user.id,
        acceptedAt: new Date(),
      },
    });
    await recordAudit(tx, {
      workspaceId: invitation.workspaceId,
      actorId: input.user.id,
      action: "invitation.accepted",
      targetType: "Invitation",
      targetId: invitation.id,
      metadata: { roles: invitation.roles },
    });
    return { workspaceId: invitation.workspaceId, membership };
  });
}

export async function listMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId, status: "ACTIVE" },
    include: { user: { select: { id: true, displayName: true, email: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function updateMemberRoles(input: {
  workspaceId: string;
  membershipId: string;
  roles: WorkspaceRole[];
  actorId: string;
  rolesOfActor: WorkspaceRole[];
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can change member roles.");
  }
  if (input.roles.includes("OWNER") || input.roles.length === 0) {
    throw conflict("Ownership is transferred separately. Choose at least one other role.");
  }

  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, workspaceId: input.workspaceId },
  });
  if (!membership) throw notFound("Membership not found.");
  if (membership.roles.includes("OWNER")) {
    throw conflict("The workspace owner's role cannot be changed.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: { roles: input.roles },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "membership.roles_changed",
      targetType: "Membership",
      targetId: membership.id,
      metadata: { roles: input.roles },
    });
  });
}

export async function removeMember(input: {
  workspaceId: string;
  membershipId: string;
  actorId: string;
  rolesOfActor: WorkspaceRole[];
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can remove members.");
  }
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, workspaceId: input.workspaceId },
    include: { user: { select: { displayName: true } } },
  });
  if (!membership) throw notFound("Membership not found.");
  if (membership.roles.includes("OWNER")) {
    throw conflict("The workspace owner cannot be removed.");
  }

  const activeAssignments = await prisma.taskAssignment.count({
    where: {
      userId: membership.userId,
      status: "ACTIVE",
      task: { project: { workspaceId: input.workspaceId } },
    },
  });
  if (activeAssignments > 0) {
    throw conflict(
      "Reassign this member's active tasks before removing them. Their annotation history is preserved.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: membership.id } });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "membership.removed",
      targetType: "Membership",
      targetId: membership.id,
      metadata: { displayName: membership.user.displayName },
    });
  });
}

export async function renameWorkspace(input: {
  workspaceId: string;
  name: string;
  actorId: string;
  rolesOfActor: WorkspaceRole[];
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can rename this workspace.");
  }
  const slug = await uniqueWorkspaceSlug(input.name);
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { name: input.name, slug },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "workspace.renamed",
      targetType: "Workspace",
      targetId: input.workspaceId,
      metadata: { name: input.name },
    });
  });
}

export async function deleteWorkspace(input: {
  workspaceId: string;
  confirmation: string;
  actorId: string;
  rolesOfActor: WorkspaceRole[];
}) {
  if (!isOwner(input.rolesOfActor)) {
    throw forbidden("Only the workspace owner can delete this workspace.");
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
  });
  if (!workspace) throw notFound("Workspace not found.");
  if (input.confirmation !== workspace.slug) {
    throw conflict("Type the workspace slug exactly to confirm deletion.");
  }
  await prisma.workspace.delete({ where: { id: workspace.id } });
}
