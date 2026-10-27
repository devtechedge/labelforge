import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateProjectForm } from "@/components/WorkspaceForms";
import { Forbidden } from "@/components/Forbidden";
import { getWorkspaceAccess, requirePageUser } from "@/auth/session";
import { isManager } from "@/auth/permissions";

export const metadata: Metadata = {
  title: "New project",
};

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await requirePageUser();
  const { workspaceId } = await params;
  const access = await getWorkspaceAccess(workspaceId, user);
  if (!access) notFound();

  if (!isManager(access.roles)) {
    return (
      <Forbidden
        title="Managers create projects"
        body="Your current workspace roles do not include Manager or Owner. Ask the owner if you need to create projects."
        backHref={`/workspaces/${workspaceId}`}
      />
    );
  }

  return (
    <main id="main-content" className="page">
      <div className="container-narrow stack-lg">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/workspaces">Workspaces</Link>
          <span className="sep">/</span>
          <Link href={`/workspaces/${workspaceId}`}>{access.workspace.name}</Link>
          <span className="sep">/</span>
          <span>New project</span>
        </nav>
        <div className="page-intro">
          <div>
            <p className="eyebrow">Create / {access.workspace.name}</p>
            <h1>A project holds one dataset lineage</h1>
            <p className="intro-meta">
              <span>Empty dataset container</span>
              <span>Import next</span>
              <span>Schema before tasks</span>
            </p>
          </div>
        </div>
        <p className="section-lede">
          Start with an empty dataset container. Import a CSV or JSONL file next,
          then publish a schema before generating tasks.
        </p>
        <div className="card card-pad">
          <CreateProjectForm workspaceId={workspaceId} />
        </div>
      </div>
    </main>
  );
}
