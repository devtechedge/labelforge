import "server-only";

import { prisma } from "@/lib/db";

let lastRunAt = 0;
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export type MaintenanceResult = {
  skipped: boolean;
  importBatches: number;
  sessions: number;
  rateLimitBuckets: number;
};

export async function cleanupStaleData(options?: { force?: boolean }): Promise<MaintenanceResult> {
  const now = Date.now();
  if (!options?.force && now - lastRunAt < MIN_INTERVAL_MS) {
    return { skipped: true, importBatches: 0, sessions: 0, rateLimitBuckets: 0 };
  }
  lastRunAt = now;

  const importCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const sessionCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const rateCutoff = new Date(now - 48 * 60 * 60 * 1000);

  const [importBatches, sessions, rateLimitBuckets] = await Promise.all([
    prisma.importBatch.deleteMany({
      where: {
        status: { in: ["PREVIEW_READY", "EXPIRED"] },
        expiresAt: { lt: importCutoff },
      },
    }),
    prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: sessionCutoff } },
          { revokedAt: { lt: sessionCutoff } },
        ],
      },
    }),
    prisma.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: rateCutoff } },
    }),
  ]);

  return {
    skipped: false,
    importBatches: importBatches.count,
    sessions: sessions.count,
    rateLimitBuckets: rateLimitBuckets.count,
  };
}
