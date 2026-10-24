import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChrome } from "@/components/project/ProjectChrome";
import { TaskAssignmentTable } from "@/components/TaskAssignmentTable";
import { EmptyState } from "@/components/EmptyState";
import { requireProjectPage } from "@/auth/project-page";
import { canAnnotate, isManager } from "@/auth/permissions";
import { listMembers } from "@/services/workspaces";
import { listProjectTasks } from "@/services/tasks";
import { LIMITS } from "@/domain/limits";
import { TASK_STATUS_ORDER, TASK_STATUS_LABELS } from "@/domain/workflow";

export const metadata: Metadata = {
  title: "Tasks",
};

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ status?: string; assignee?: string; page?: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const query = await searchParams;
  const access = await requireProjectPage(workspaceId, projectId);
  const manager = isManager(access.roles);
  const annotator = canAnnotate(access.roles);
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const status = TASK_STATUS_ORDER.includes(query.status as never)
    ? query.status
    : undefined;
  const assignedFilter = manager || !annotator
    ? query.assignee || undefined
    : access.user.id;

  const [result, members] = await Promise.all([
    listProjectTasks({
      projectId,
      status,
      assigneeId: assignedFilter,
      page,
      limit: LIMITS.tasksPerPage,
    }),
    listMembers(workspaceId),
  ]);
  if (!result) notFound();

  const annotators = members
    .filter((membership) => membership.roles.includes("ANNOTATOR"))
    .map((membership) => ({
      id: membership.user.id,
      name: membership.user.displayName,
    }));
  const assigneeOptions = members.filter((membership) =>
    membership.roles.includes("ANNOTATOR"),
  );

  const totalPages = Math.max(1, Math.ceil(result.total / LIMITS.tasksPerPage));
  const base = `/workspaces/${workspaceId}/projects/${projectId}/tasks`;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.assignee) params.set("assignee", query.assignee);
    params.set("page", String(targetPage));
    return `${base}?${params.toString()}`;
  }

  const rows = result.tasks.map((task) => {
    const mine = task.annotations.find(
      (annotation) => annotation.annotatorId === access.user.id,
    );
    return {
      id: task.id,
      status: task.status,
      sourceId: task.datasetRecord.sourceId,
      sourceOrder: task.datasetRecord.sourceOrder,
      requiredAnnotations: task.requiredAnnotations,
      updatedAt: task.updatedAt.toISOString(),
      assignments: task.assignments.map((assignment) => ({
        userId: assignment.userId,
        userName: assignment.user.displayName,
        userEmail: assignment.user.email,
      })),
      annotations: task.annotations.map((annotation) => ({
        annotatorId: annotation.annotatorId,
        status: annotation.status,
        revision: annotation.revision,
      })),
      myAnnotation: mine
        ? { status: mine.status, revision: mine.revision }
        : null,
    };
  });

  return (
    <ProjectChrome
      workspaceId={workspaceId}
      workspaceName={access.workspace.name}
      projectId={projectId}
      projectName={access.project.name}
      projectStatus={access.project.status}
      annotationMode={access.project.annotationMode}
      roles={access.roles}
      description={access.project.description}
    >
      <div className="stack-lg">
        <div className="spread">
          <div className="stack">
            <p className="eyebrow">Task inventory</p>
            <h2 className="display-md">
              {annotator && !manager ? "Your queue" : "Distribution and status"}
            </h2>
            <p className="muted small">
              {result.total} tasks in this view. Statuses and counts come directly
              from persisted workflow records.
            </p>
          </div>
          {manager ? (
            <Link
              className="btn btn-secondary"
              href={`/workspaces/${workspaceId}/projects/${projectId}/schema`}
            >
              Generate tasks
            </Link>
          ) : null}
        </div>

        <form className="filters" method="get" action={base}>
          <div className="field">
            <label htmlFor="filter-status">Status</label>
            <select
              className="select"
              id="filter-status"
              name="status"
              defaultValue={status ?? ""}
            >
              <option value="">All statuses</option>
              {TASK_STATUS_ORDER.map((option) => (
                <option key={option} value={option}>
                  {TASK_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          {manager || !annotator ? (
            <div className="field">
              <label htmlFor="filter-assignee">Assignee</label>
              <select
                className="select"
                id="filter-assignee"
                name="assignee"
                defaultValue={query.assignee ?? ""}
              >
                <option value="">Anyone</option>
                {assigneeOptions.map((membership) => (
                  <option key={membership.user.id} value={membership.user.id}>
                    {membership.user.displayName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button className="btn btn-secondary btn-sm" type="submit">
            Apply filters
          </button>
          {status || query.assignee ? (
            <Link className="btn btn-ghost btn-sm" href={base}>
              Clear
            </Link>
          ) : null}
        </form>

        {result.tasks.length === 0 ? (
          <EmptyState
            title="No tasks in this view"
            body={
              manager
                ? "Generate tasks from a published schema and committed dataset, or clear the filters."
                : "There is no assigned work in this view right now."
            }
            actionHref={manager ? `${base.replace(/\/tasks$/, "/schema")}` : undefined}
            actionLabel={manager ? "Open schema" : undefined}
          />
        ) : (
          <TaskAssignmentTable
            workspaceId={workspaceId}
            projectId={projectId}
            tasks={rows}
            annotators={annotators}
            canAssign={manager}
            annotationMode={access.project.annotationMode}
            currentUserId={access.user.id}
            canAnnotate={annotator}
          />
        )}

        {totalPages > 1 ? (
          <nav className="pagination" aria-label="Task pages">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="cluster">
              {page > 1 ? (
                <Link className="btn btn-secondary btn-sm" href={pageHref(page - 1)}>
                  Previous
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link className="btn btn-secondary btn-sm" href={pageHref(page + 1)}>
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </div>
    </ProjectChrome>
  );
}
