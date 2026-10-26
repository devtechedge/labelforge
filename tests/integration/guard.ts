import { URL } from "node:url";

export function assertTestDatabase(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is required for integration tests.");
  const parsed = new URL(url);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "db"]);
  const database = (parsed.pathname || "").replace(/^\//, "");
  if (!localHosts.has(parsed.hostname) || !database.endsWith("_test")) {
    throw new Error(
      "Refusing integration tests outside a local database whose name ends in _test.",
    );
  }
  return url;
}
