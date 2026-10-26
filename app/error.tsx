"use client";

import Link from "next/link";

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
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 5.5h9.5M4 12h7M4 18.5h4.5" strokeLinecap="round" />
                <rect x="14.5" y="8.5" width="5.5" height="11" rx="1.2" />
                <path d="M17.2 5.2v1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="brand-name">LabelForge</span>
          </Link>
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
