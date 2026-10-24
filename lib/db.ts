import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";

const globalForPrisma = globalThis as unknown as {
  labelforgePrisma?: PrismaClient;
};

export const prisma = globalForPrisma.labelforgePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.labelforgePrisma = prisma;
}
