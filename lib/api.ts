import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { env } from "@/lib/env";
import { AppError, isAppError, validationFailed } from "@/lib/errors";

const MAX_JSON_BYTES = 1024 * 1024;

export function apiOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(
      "FORBIDDEN",
      "Mutating API requests must come from the application origin.",
      403,
    );
  }

  const allowed = new Set<string>([new URL(request.url).origin]);
  try {
    allowed.add(new URL(env.NEXT_PUBLIC_APP_URL).origin);
  } catch {
    // Env validation already guarantees a valid URL.
  }

  if (!allowed.has(origin)) {
    throw new AppError("FORBIDDEN", "Cross-origin request rejected.", 403);
  }
}

export async function readJson<Schema extends ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ data: import("zod").infer<Schema>; text: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Send this request as JSON.",
      422,
    );
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw validationFailed("Request body is not valid JSON.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw validationFailed("Check the submitted fields.", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return { data: result.data as import("zod").infer<Schema>, text };
}

export async function readJsonUnknown(
  request: Request,
): Promise<{ data: unknown; text: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError("VALIDATION_FAILED", "Send this request as JSON.", 422);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413);
  }
  try {
    return { data: JSON.parse(text) as unknown, text };
  } catch {
    throw validationFailed("Request body is not valid JSON.");
  }
}

export function handleApiError(error: unknown): NextResponse {
  const requestId = crypto.randomUUID();

  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
          requestId,
        },
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Check the submitted fields.",
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          requestId,
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("Unhandled API error", {
    requestId,
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message.slice(0, 200) : undefined,
  });

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Try again.",
        details: null,
        requestId,
      },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
