"use server";

import { headers } from "next/headers";

import type { FormActionState } from "@/lib/action-state";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { createSession, destroyCurrentSession } from "@/auth/session";
import { AppError, isAppError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { demoLoginUser, loginUser, signupUser, type DemoRole } from "@/services/auth";
import {
  demoLoginSchema,
  loginSchema,
  safeNextPath,
  signupSchema,
} from "@/validation/requests";

function actionError(error: unknown): FormActionState {
  if (isAppError(error)) {
    return { error: error.message };
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  console.error("Auth action failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return { error: "Something went wrong. Try again." };
}

async function requestIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
}

export async function loginAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let destination: string;
  try {
    const data = loginSchema.parse({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      next: String(formData.get("next") ?? ""),
    });
    const user = await loginUser({
      email: data.email,
      password: data.password,
      ip: await requestIp(),
    });
    await createSession(user.id);
    destination = safeNextPath(data.next);
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function signupAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let destination: string;
  try {
    const data = signupSchema.parse({
      displayName: String(formData.get("displayName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      next: String(formData.get("next") ?? ""),
    });
    const user = await signupUser({
      displayName: data.displayName,
      email: data.email,
      password: data.password,
      ip: await requestIp(),
    });
    await createSession(user.id);
    destination = safeNextPath(data.next);
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function demoLoginAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const data = demoLoginSchema.parse({
      role: String(formData.get("role") ?? ""),
    });
    const ip = await requestIp();
    await enforceRateLimit("demo-form:ip", ip, RATE_LIMITS.demoLogin);
    const user = await demoLoginUser(data.role as DemoRole, ip);
    await createSession(user.id);
  } catch (error) {
    return actionError(error);
  }
  redirect("/workspaces");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/");
}
