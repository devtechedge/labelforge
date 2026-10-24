import { createHash } from "node:crypto";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function assertFiniteNumbers(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical JSON cannot represent non-finite numbers.");
  }
  if (Array.isArray(value)) {
    for (const item of value) assertFiniteNumbers(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) assertFiniteNumbers(item);
  }
}

function normalize(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON cannot represent non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(object).sort()) {
      const item = object[key];
      if (item === undefined) continue;
      result[key] = normalize(item);
    }
    return result;
  }
  throw new Error("Canonical JSON received an unsupported value.");
}

export function canonicalJson(value: unknown): string {
  assertFiniteNumbers(value);
  return JSON.stringify(normalize(value));
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
