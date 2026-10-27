import Link from "next/link";

import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/auth/session";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <div className="cluster" style={{ gap: "1.1rem" }}>
          <Brand href="/workspaces" />
          <span className="workbench-divider" aria-hidden="true" />
          <nav className="app-nav" aria-label="Workspace navigation">
            <Link href="/workspaces">Workspaces</Link>
          </nav>
        </div>
        <div className="app-nav">
          <ThemeToggle />
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">
              {initials(user.displayName)}
            </span>
            <span className="user-email">{user.displayName}</span>
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
