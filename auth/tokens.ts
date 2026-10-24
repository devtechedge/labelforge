import { randomBytes } from "node:crypto";

import { sha256Hex } from "@/domain/canonical";

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return sha256Hex(token);
}

export function newSubmissionKey(): string {
  return randomBytes(16).toString("base64url");
}
