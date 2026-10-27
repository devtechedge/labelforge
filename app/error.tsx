"use client";

import Link from "next/link";

import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <header className="public-header">
        <div className="container">
          <Brand />
          <div className="cluster">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content" className="page container-narrow">
        <div className="empty-state">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="display-md">The workbench could not finish that request</h1>
          <p className="lede small">
            Your saved work is still in the database. Retry the request, or
            return to the workspace and open the task again.
          </p>
          <div className="cluster">
            <button className="btn btn-primary" type="button" onClick={reset}>
              Try again
            </button>
            <Link className="btn btn-secondary" href="/workspaces">
              Open workspaces
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
