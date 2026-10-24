import "server-only";

import { prisma } from "@/lib/db";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/auth/password";
import { AppError, validationFailed } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { env } from "@/lib/env";

const DEMO_ACCOUNTS = [
  { role: "owner", email: "owner@labelforge.demo" },
  { role: "manager", email: "manager@labelforge.demo" },
  { role: "reviewer", email: "reviewer@labelforge.demo" },
  { role: "annotator", email: "maya@labelforge.demo" },
] as const;

export type DemoRole = (typeof DEMO_ACCOUNTS)[number]["role"];

export async function loginUser(input: {
  email: string;
  password: string;
  ip: string;
}) {
  await enforceRateLimit("login:ip", input.ip, RATE_LIMITS.login);
  await enforceRateLimit("login:email", input.email, RATE_LIMITS.login);

  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || user.disabledAt) {
    await burnPasswordCheck(input.password);
    throw new AppError(
      "UNAUTHENTICATED",
      "That email and password do not match an active account.",
      401,
    );
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(
      "UNAUTHENTICATED",
      "That email and password do not match an active account.",
      401,
    );
  }

  return user;
}

export async function signupUser(input: {
  displayName: string;
  email: string;
  password: string;
  ip: string;
}) {
  await enforceRateLimit("signup:ip", input.ip, RATE_LIMITS.signup);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    await burnPasswordCheck(input.password);
    throw validationFailed(
      "We could not create an account with those details. Try signing in instead.",
      { issues: [{ path: "email", message: "That email cannot be used." }] },
    );
  }

  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      },
    });
  } catch {
    await burnPasswordCheck(input.password);
    throw validationFailed(
      "We could not create an account with those details. Try signing in instead.",
      { issues: [{ path: "email", message: "That email cannot be used." }] },
    );
  }
}

export async function demoLoginUser(role: DemoRole, ip: string) {
  if (!env.DEMO_MODE) {
    throw new AppError("NOT_FOUND", "Demo sign-in is not enabled.", 404);
  }
  await enforceRateLimit("demo:ip", ip, RATE_LIMITS.demoLogin);

  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  if (!account) throw new AppError("NOT_FOUND", "Unknown demo role.", 404);

  const user = await prisma.user.findUnique({ where: { email: account.email } });
  if (!user || user.disabledAt) {
    throw new AppError(
      "NOT_FOUND",
      "That demo identity is not seeded on this deployment.",
      404,
    );
  }
  return user;
}
