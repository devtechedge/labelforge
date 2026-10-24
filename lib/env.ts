import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DEMO_DEPLOYMENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  DEMO_MODE: process.env.DEMO_MODE,
  DEMO_DEPLOYMENT: process.env.DEMO_DEPLOYMENT,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join("."));
  throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
}

export const env = parsed.data;
