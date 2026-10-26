import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="page container-narrow">
        <div className="empty-state">
          <p className="eyebrow">404</p>
          <h1 className="display-md">This page is not on the workbench</h1>
          <p className="lede small">
            The address may have changed, or your account may not have access to
            the workspace behind it.
          </p>
          <div className="cluster">
            <Link className="btn btn-primary" href="/workspaces">
              Open workspaces
            </Link>
            <Link className="btn btn-secondary" href="/">
              Product overview
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
