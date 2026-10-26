import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  acceptInvitation,
  createInvitation,
} from "@/services/workspaces";
import {
  addMember,
  createEmptyProject,
  createUser,
  resetDatabase,
} from "./helpers";

describe("workspace invitations", () => {
  beforeEach(resetDatabase);

  it("stores a hashed token and binds acceptance to the invited email", async () => {
    const fixture = await createEmptyProject("invite");
    const { invitation, token } = await createInvitation({
      actor: fixture.owner,
      workspaceId: fixture.workspace.id,
      rolesOfActor: ["OWNER"],
      email: "new-person@example.com",
      roles: ["ANNOTATOR"],
    });
    expect(invitation.tokenHash).not.toBe(token);
    expect(invitation.tokenHash).toHaveLength(64);

    const invitee = await prisma.user.create({
      data: {
        email: "new-person@example.com",
        displayName: "New Person",
        passwordHash: "test-hash",
      },
    });
    const result = await acceptInvitation({
      user: {
        id: invitee.id,
        email: invitee.email,
        displayName: invitee.displayName,
      },
      token,
    });
    expect(result.workspaceId).toBe(fixture.workspace.id);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        workspaceId_userId: {
          workspaceId: fixture.workspace.id,
          userId: invitee.id,
        },
      },
    });
    expect(membership.roles).toEqual(["ANNOTATOR"]);
    await expect(
      acceptInvitation({
        user: {
          id: invitee.id,
          email: invitee.email,
          displayName: invitee.displayName,
        },
        token,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an invitation used by a different email address", async () => {
    const fixture = await createEmptyProject("invite-theft");
    const { token } = await createInvitation({
      actor: fixture.owner,
      workspaceId: fixture.workspace.id,
      rolesOfActor: ["OWNER"],
      email: "intended@example.com",
      roles: ["REVIEWER"],
    });
    const other = await createUser("other");
    await expect(
      acceptInvitation({ user: other, token }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("expires invitations and refuses acceptance after the deadline", async () => {
    const fixture = await createEmptyProject("invite-expired");
    const { invitation, token } = await createInvitation({
      actor: fixture.owner,
      workspaceId: fixture.workspace.id,
      rolesOfActor: ["OWNER"],
      email: "late@example.com",
      roles: ["ANNOTATOR"],
    });
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const invitee = await prisma.user.create({
      data: {
        email: "late@example.com",
        displayName: "Late Person",
        passwordHash: "test-hash",
      },
    });
    await expect(
      acceptInvitation({
        user: {
          id: invitee.id,
          email: invitee.email,
          displayName: invitee.displayName,
        },
        token,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }))
        .status,
    ).toBe("EXPIRED");
  });

  it("allows only the owner to create invitations", async () => {
    const fixture = await createEmptyProject("invite-role");
    const manager = await createUser("manager");
    await addMember(fixture.workspace.id, manager.id, ["MANAGER"]);
    await expect(
      createInvitation({
        actor: manager,
        workspaceId: fixture.workspace.id,
        rolesOfActor: ["MANAGER"],
        email: `manager-invite-${randomUUID()}@example.com`,
        roles: ["ANNOTATOR"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
