import "server-only";

import { prisma } from "@/lib/db";
import { sha256Hex } from "@/domain/canonical";
import { AppError } from "@/lib/errors";
import { LIMITS } from "@/domain/limits";

export type RateLimitConfig = { limit: number; windowMs: number };

export function rateLimitKey(scope: string, identifier: string): string {
  return `${scope}:${sha256Hex(identifier.trim().toLowerCase())}`;
}

export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim();
  return (candidate || request.headers.get("x-real-ip") || "unknown").slice(0, 120);
}

export async function enforceRateLimit(
  scope: string,
  identifier: string,
  config: RateLimitConfig,
): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(
    Math.floor(now / config.windowMs) * config.windowMs,
  );
  const key = rateLimitKey(scope, identifier);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (Math.random() < 0.02) {
    void prisma.rateLimitBucket
      .deleteMany({ where: { windowStart: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
      .catch(() => undefined);
  }

  if (bucket.count > config.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart.getTime() + config.windowMs - now) / 1000),
    );
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Wait a moment, then try again.",
      429,
      { retryAfterSeconds },
    );
  }
}

export const RATE_LIMITS = LIMITS.rateLimit;
