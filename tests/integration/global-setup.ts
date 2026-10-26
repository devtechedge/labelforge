import { execSync } from "node:child_process";

import { assertTestDatabase } from "./guard";

export default function globalSetup() {
  const url = assertTestDatabase(process.env.DATABASE_URL);
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
