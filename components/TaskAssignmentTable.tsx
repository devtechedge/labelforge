"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative } from "@/lib/format";

type TaskRow = {
  id: string;
  status: string;
  sourceId: string;
  sourceOrder: number;
  requiredAnnotations: number;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    userName: string;
    userEmail: string;
  }>;
  annotations: Array<{
    annotatorId: string;
    status: string;
    revision: number;
  }>;
  myAnnotation: { status: string; revision: number } | null;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function TaskAssignmentTable({
  workspaceId,
  projectId,
  tasks,
  annotators,
  canAssign,
  annotationMode,
  currentUserId,
  canAnnotate,
}: {
  workspaceId: string;
  projectId: string;
  tasks: TaskRow[];
  annotators: Array<{ id: string; name: string }>;
  canAssign: boolean;
  annotationMode: "SINGLE" | "MULTI";
  currentUserId: string;
  canAnnotate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(annotators[0]?.id ?? "");
  const [busy, setBusy] = useState<"assign" | "reassign" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = tasks.length > 0 && tasks.every((task) => selected.has(task.id));
  const selectedCount = selected.size;
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selected.has(task.id)),
    [tasks, selected],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tasks.map((task) => task.id)));
  }

  async function submit(kind: "assign" | "reassign") {
    if (!target) {
      setError("Choose an annotator first.");
      return;
    }
    if (selectedCount === 0) {
      setError("Select at least one task.");
      return;
    }
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const endpoint = kind === "assign" ? "assignments" : "reassign";
      const body =
        kind === "assign"
          ? { taskIds: [...selected], userIds: [target] }
          : { taskIds: [...selected], userId: target };
      const response = await fetch(`/api/projects/${projectId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setMessage(
        kind === "assign"
          ? `Assigned ${selectedCount} task${selectedCount === 1 ? "" : "s"}.`
          : `Reassigned ${selectedCount} task${selectedCount === 1 ? "" : "s"}.`,
      );
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("The request failed before it reached the server.");
    } finally {
      setBusy(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <p className="small muted">
        No tasks match this view. Generate tasks from a published schema or clear
        the filters.
      </p>
    );
  }

  return (
    <div className="stack">
      {canAssign ? (
        <div className="panel panel-pad stack">
          <div className="spread">
            <div>
              <p className="field-label">Bulk assignment</p>
              <p className="field-hint">
                {selectedCount} selected.{" "}
                {annotationMode === "MULTI"
                  ? "Multi-annotator tasks accept up to the required number of active assignees."
                  : "Single-annotator tasks accept one active assignee."}
              </p>
            </div>
            <div className="cluster">
              <div className="field">
                <label htmlFor="assignment-target" className="field-hint">
                  Annotator
                </label>
                <select
                  className="select"
                  id="assignment-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  style={{ minWidth: "14rem" }}
                >
                  {annotators.length === 0 ? (
                    <option value="">No eligible annotators</option>
                  ) : null}
                  {annotators.map((annotator) => (
                    <option key={annotator.id} value={annotator.id}>
                      {annotator.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => submit("assign")}
                disabled={busy !== null || !target || selectedCount === 0}
              >
                {busy === "assign" ? "Assigning..." : "Assign selected"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => submit("reassign")}
                disabled={busy !== null || !target || selectedCount === 0}
              >
                {busy === "reassign" ? "Reassigning..." : "Reassign selected"}
              </button>
            </div>
          </div>
          <p className="field-hint">
            Reassignment releases current active assignments and preserves their
            drafts and history. Submitted or reviewed work cannot be reassigned.
          </p>
          {message ? (
            <div className="success-note" role="status">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="error-summary" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Project annotation tasks</caption>
          <thead>
            <tr>
              {canAssign ? (
                <th scope="col" style={{ width: "2.5rem" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all tasks on this page"
                  />
                </th>
              ) : null}
              <th scope="col">Task</th>
              <th scope="col">Status</th>
              <th scope="col">Assignees</th>
              <th scope="col">Submissions</th>
              <th scope="col">Updated</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const submitted = task.annotations.filter((annotation) =>
                ["SUBMITTED", "ACCEPTED", "DISPUTED"].includes(annotation.status),
              ).length;
              const isMine = task.assignments.some(
                (assignment) => assignment.userId === currentUserId,
              );
              return (
                <tr key={task.id}>
                  {canAssign ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => toggle(task.id)}
                        aria-label={`Select task ${task.sourceId}`}
                      />
                    </td>
                  ) : null}
                  <td>
                    <span className="mono">{task.sourceId}</span>
                    <br />
                    <span className="tiny muted">Source order {task.sourceOrder}</span>
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    {task.assignments.length === 0 ? (
                      <span className="muted tiny">Unassigned</span>
                    ) : (
                      <span className="tiny">
                        {task.assignments.map((assignment) => assignment.userName).join(", ")}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="mono tiny">
                      {submitted} / {task.requiredAnnotations}
                    </span>
                  </td>
                  <td className="tiny muted" suppressHydrationWarning>{formatRelative(task.updatedAt)}</td>
                  <td>
                    {isMine && canAnnotate ? (
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/workspaces/${workspaceId}/projects/${projectId}/annotate/${task.id}`}
                      >
                        {task.myAnnotation?.status === "DRAFT" ||
                        task.myAnnotation?.status === "RETURNED_FOR_CORRECTION"
                          ? "Continue"
                          : "Open workbench"}
                      </Link>
                    ) : (
                      <span className="tiny muted">
                        {task.myAnnotation
                          ? `Yours: ${task.myAnnotation.status.toLowerCase()}`
                          : "View only"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedTasks.length > 0 && annotationMode === "MULTI" ? (
        <p className="tiny muted">
          Reassigning a multi-annotator task replaces exactly one active annotator.
          If a task has two or more active annotators, use a narrower selection.
        </p>
      ) : null}
    </div>
  );
}
