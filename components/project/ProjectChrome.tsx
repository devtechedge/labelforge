import Link from "next/link";

import { ProjectTabs, type ProjectTab } from "@/components/project/ProjectTabs";
import { isManager, canReview, roleLabels } from "@/auth/permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export function ProjectChrome({
  workspaceId,
  workspaceName,
  projectId,
  projectName,
  projectStatus,
  annotationMode,
  roles,
  description,
  children,
}: {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  projectStatus: "ACTIVE" | "ARCHIVED";
  annotationMode: "SINGLE" | "MULTI";
  roles: WorkspaceRole[];
  description: string;
  children: React.ReactNode;
}) {
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const tabs: ProjectTab[] = [
    { href: base, label: "Overview", exact: true },
    ...(isManager(roles)
      ? [
          { href: `${base}/import`, label: "Import" },
          { href: `${base}/schema`, label: "Schema" },
        ]
      : []),
    { href: `${base}/tasks`, label: "Tasks" },
    ...(isManager(roles) || canReview(roles)
      ? [{ href: `${base}/review`, label: "Review" }]
      : []),
    { href: `${base}/quality`, label: "Quality" },
    { href: `${base}/releases`, label: "Releases" },
  ];

  return (
    <>
      <div className="project-header">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/workspaces">Workspaces</Link>
            <span className="sep">/</span>
            <Link href={`/workspaces/${workspaceId}`}>{workspaceName}</Link>
            <span className="sep">/</span>
            <span>{projectName}</span>
          </nav>
          <div className="project-heading">
            <div className="project-title">
              <p className="eyebrow">
                Project / {annotationMode === "MULTI" ? "Multi-annotator" : "Single annotator"}
              </p>
              <h1>{projectName}</h1>
              <p className="small muted">
                {description || "No project description."}
              </p>
            </div>
            <div className="project-badges">
              <span
                className={`badge ${
                  projectStatus === "ARCHIVED" ? "status-archived" : "status-active"
                }`}
              >
                {projectStatus === "ARCHIVED" ? "Archived" : "Active"}
              </span>
              <span className="badge badge-soft">
                {roleLabels(roles).join(" · ")}
              </span>
            </div>
          </div>
          <ProjectTabs tabs={tabs} />
        </div>
      </div>
      <main id="main-content" className="page-tight">
        <div className="container">{children}</div>
      </main>
    </>
  );
}
