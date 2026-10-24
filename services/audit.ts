import "server-only";

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
