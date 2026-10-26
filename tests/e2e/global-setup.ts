import { execSync } from "node:child_process";
import { URL } from "node:url";

function assertTestDatabase(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for e2e tests.");
  const parsed = new URL(value);
  const database = (parsed.pathname || "").replace(/^\//, "");
  if (
    !["localhost", "127.0.0.1", "::1", "db"].includes(parsed.hostname) ||
    !database.endsWith("_test")
  ) {
    throw new Error(
      "Refusing e2e tests outside a local database whose name ends in _test.",
    );
  }
  return value;
}

export default function globalSetup() {
  const databaseUrl = assertTestDatabase(process.env.DATABASE_URL);
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DEMO_MODE: "true",
    DEMO_DEPLOYMENT: "false",
  };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts --reset", { stdio: "inherit", env });
}
