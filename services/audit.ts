import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type AuditWriter = {
  auditEvent: {
    create: (args: Prisma.AuditEventCreateArgs) => Promise<unknown>;
  };
};

export type AuditInput = {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordAudit(
  db: AuditWriter,
  input: AuditInput,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function listAuditEvents(input: {
  workspaceId: string;
  page: number;
  limit: number;
}) {
  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { actor: { select: { id: true, displayName: true } } },
    }),
    prisma.auditEvent.count({ where: { workspaceId: input.workspaceId } }),
  ]);
  return { events, total };
}
