"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AnswerFields } from "@/components/AnswerFields";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  AnnotationAnswer,
  AnnotationSchema,
} from "@/domain/schema";
import { validateAnswer, type AnswerIssue } from "@/domain/answers";
import { TASK_STATUS_LABELS } from "@/domain/workflow";
import { formatRelative } from "@/lib/format";

type ReviewView = {
  id: string;
  decision: string;
  feedback: string | null;
  reviewerName: string;
  createdAt: string;
};

export type WorkbenchData = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  task: {
    id: string;
    status: string;
    version: number;
    requiredAnnotations: number;
    sourceId: string;
    sourceOrder: number;
    record: Record<string, unknown>;
    schema: AnnotationSchema;
    schemaVersionNumber: number;
  };
  annotation: {
    id: string;
    status: string;
    revision: number;
    answer: AnnotationAnswer;
    submittedAt: string | null;
    lastSavedAt: string;
    reviews: ReviewView[];
  } | null;
  queue: Array<{
    id: string;
    status: string;
    sourceId: string;
    annotationStatus: string | null;
  }>;
};

type SaveState = "clean" | "unsaved" | "saving" | "saved" | "conflict" | "error";

const LOCKED_TASKS = [
  "SUBMITTED",
  "IN_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "DISPUTED",
  "ADJUDICATION",
  "RESOLVED",
];

function apiIssues(payload: unknown): AnswerIssue[] {
  if (!payload || typeof payload !== "object") return [];
  const details = (payload as { error?: { details?: unknown } }).error?.details;
  if (!details || typeof details !== "object") return [];
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues
    .filter(
      (issue): issue is { path: unknown; message: unknown } =>
        Boolean(issue) && typeof issue === "object",
    )
    .map((issue) => ({
      field: typeof issue.path === "string" ? issue.path : "_form",
      message: typeof issue.message === "string" ? issue.message : "Invalid answer.",
    }));
}

function renderRecordValue(value: unknown): string {
  if (value === null || value === undefined) return "No value";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function AnnotationWorkbench({ data }: { data: WorkbenchData }) {
  const router = useRouter();
  const { task } = data;
  const initialAnswer = data.annotation?.answer ?? {};
  const [answer, setAnswer] = useState<AnnotationAnswer>(initialAnswer);
  const [saveState, setSaveState] = useState<SaveState>(
    data.annotation ? "saved" : "clean",
  );
  const [savedAt, setSavedAt] = useState<string | null>(
    data.annotation?.lastSavedAt ?? data.annotation?.submittedAt ?? null,
  );
  const [relativeSaved, setRelativeSaved] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitIssues, setSubmitIssues] = useState<AnswerIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const revisionRef = useRef(data.annotation?.revision ?? 0);
  const annotationExistsRef = useRef(Boolean(data.annotation));
  const savingRef = useRef(false);
  const initialized = useRef(false);
  const lastSavedRef = useRef(JSON.stringify(initialAnswer));
  const confirmRef = useRef<HTMLDialogElement>(null);
  const missingRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const saveNowRef = useRef<(nextAnswer: AnnotationAnswer) => Promise<number | null>>(
    async () => null,
  );

  const lockedByTask = LOCKED_TASKS.includes(task.status);
  const annotationEditable =
    !data.annotation ||
    data.annotation.status === "DRAFT" ||
    data.annotation.status === "RETURNED_FOR_CORRECTION";
  const editable = !lockedByTask && annotationEditable && !submitted;
  const readOnly = !editable;

  const saveNow = useCallback(
    async (nextAnswer: AnnotationAnswer): Promise<number | null> => {
      if (!editable || conflict) return null;
      if (
        annotationExistsRef.current &&
        JSON.stringify(nextAnswer) === lastSavedRef.current
      ) {
        return revisionRef.current;
      }
      if (savingRef.current) return null;
      savingRef.current = true;
      setSaveState("saving");
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/tasks/${task.id}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer: nextAnswer,
            expectedRevision: revisionRef.current,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              annotation?: {
                revision: number;
                savedAt: string;
                status: string;
                taskVersion: number;
              };
              error?: { message?: string; code?: string; details?: unknown };
            }
          | null;
        if (response.status === 409) {
          setConflict(true);
          setSaveState("conflict");
          setErrorMessage(
            payload?.error?.message ??
              "This annotation changed elsewhere. Reload before editing again.",
          );
          return null;
        }
        if (!response.ok || !payload?.annotation) {
          const issues = apiIssues(payload);
          if (issues.length > 0) {
            setFieldErrors(
              Object.fromEntries(issues.map((issue) => [issue.field, issue.message])),
            );
          }
          setSaveState("error");
          setErrorMessage(payload?.error?.message ?? "The draft could not be saved.");
          return null;
        }

        revisionRef.current = payload.annotation.revision;
        annotationExistsRef.current = true;
        lastSavedRef.current = JSON.stringify(nextAnswer);
        setSaveState("saved");
        setSavedAt(payload.annotation.savedAt);
        setFieldErrors({});
        return payload.annotation.revision;
      } catch {
        setSaveState("error");
        setErrorMessage("The save failed before it reached the server. Your text is still here.");
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [conflict, editable, task.id],
  );

  saveNowRef.current = saveNow;

  useEffect(() => {
    if (saveState !== "saved" || !savedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRelativeSaved(null);
      return;
    }
    const update = () => setRelativeSaved(formatRelative(savedAt));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [saveState, savedAt]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (readOnly || conflict) return;
    if (JSON.stringify(answer) === lastSavedRef.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => {
      void saveNow(answer);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [answer, conflict, readOnly, saveNow]);

  useEffect(() => {
    function unload(event: BeforeUnloadEvent) {
      if (saveState === "unsaved" || saveState === "saving") {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [saveState]);

  const queueIndex = data.queue.findIndex((item) => item.id === task.id);
  const previous = queueIndex > 0 ? data.queue[queueIndex - 1] : null;
  const next = queueIndex >= 0 ? data.queue[queueIndex + 1] : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNowRef.current(answer);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        openSubmit();
        return;
      }
      if (typing) return;
      if (event.key === "?") {
        event.preventDefault();
        helpRef.current?.showModal();
      }
      if ((event.key === "j" || event.key === "n") && next) {
        router.push(nextUrl(next.id));
      }
      if ((event.key === "k" || event.key === "p") && previous) {
        router.push(nextUrl(previous.id));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // openSubmit and nextUrl are stable enough for this page lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, next, previous, router]);

  function nextUrl(taskId: string): string {
    return `/workspaces/${data.workspaceId}/projects/${data.projectId}/annotate/${taskId}`;
  }

  function openSubmit() {
    if (readOnly || submitting) return;
    const validation = validateAnswer(task.schema, answer, task.record);
    const issues = validation.ok ? validation.missingRequired : validation.issues;
    if (!validation.ok || validation.missingRequired.length > 0) {
      setSubmitIssues(issues);
      setFieldErrors(
        Object.fromEntries(issues.map((issue) => [issue.field, issue.message])),
      );
      missingRef.current?.showModal();
      return;
    }
    setSubmitIssues([]);
    setSubmissionKey((current) => current ?? crypto.randomUUID());
    confirmRef.current?.showModal();
  }

  async function confirmSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const latestRevision = await saveNow(answer);
      if (latestRevision === null) {
        confirmRef.current?.close();
        setErrorMessage("The submission stopped because the latest draft could not be saved.");
        return;
      }
      const key = submissionKey ?? crypto.randomUUID();
      setSubmissionKey(key);
      const response = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestRevision,
          submissionKey: key,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            submission?: { revision: number; taskStatus: string };
            error?: { message?: string; details?: unknown };
          }
        | null;
      if (response.status === 409) {
        setConflict(true);
        setSaveState("conflict");
        setErrorMessage(
          payload?.error?.message ??
            "This task changed while you were submitting. Reload before retrying.",
        );
        confirmRef.current?.close();
        return;
      }
      if (!response.ok || !payload?.submission) {
        const issues = apiIssues(payload);
        if (issues.length > 0) {
          setSubmitIssues(issues);
          setFieldErrors(
            Object.fromEntries(issues.map((issue) => [issue.field, issue.message])),
          );
        }
        setErrorMessage(payload?.error?.message ?? "The submission failed.");
        confirmRef.current?.close();
        return;
      }
      setSubmitted(true);
      setSaveState("saved");
      setSubmitMessage("Submitted for review. This workbench is now read-only.");
      confirmRef.current?.close();
      router.refresh();
    } catch {
      setErrorMessage("The submission failed before it reached the server.");
      confirmRef.current?.close();
    } finally {
      setSubmitting(false);
    }
  }

  const saveLabel = useMemo(() => {
    if (conflict) return "Conflict";
    if (saveState === "saving") return "Saving";
    if (saveState === "unsaved") return "Unsaved changes";
    if (saveState === "error") return "Save failed";
    if (saveState === "saved") {
      return relativeSaved ? `Saved ${relativeSaved}` : "Saved";
    }
    return "No saved draft";
  }, [conflict, saveState, relativeSaved]);

  const records = Object.entries(task.record);
  const finishedInQueue = data.queue.filter((item) =>
    ["SUBMITTED", "IN_REVIEW", "ACCEPTED", "RESOLVED", "DISPUTED", "ADJUDICATION"].includes(
      item.annotationStatus ?? "",
    ),
  ).length;
  const queueCompletion =
    data.queue.length === 0 ? 0 : (finishedInQueue / data.queue.length) * 100;

  return (
    <div className="workbench-page">
      <div className="workbench-header">
        <div className="container workbench-header-inner">
          <div className="workbench-meta">
            <Link
              className="back-link"
              href={`/workspaces/${data.workspaceId}/projects/${data.projectId}/tasks`}
            >
              Tasks
            </Link>
            <span className="workbench-divider" aria-hidden="true" />
            <span className="small muted">
              {data.workspaceName} / {data.projectName}
            </span>
          </div>
          <div className="workbench-meta">
            <span className="mono tiny muted">
              {task.sourceId} / schema v{task.schemaVersionNumber}
            </span>
            <StatusBadge status={task.status} />
            <span className="save-state" data-state={saveState} aria-live="polite">
              {saveLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="container workbench-grid">
        <aside className="queue-panel" aria-label="Task queue">
          <div className="queue-head">
            <p className="eyebrow">Your queue</p>
            <p className="tiny muted" style={{ marginTop: "0.3rem" }}>
              {data.queue.length} active task{data.queue.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="queue-summary">
            <div className="spread" style={{ gap: "0.5rem" }}>
              <span className="tiny muted">Progress</span>
              <span className="mono tiny">
                {finishedInQueue} / {data.queue.length}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${queueCompletion}%` }}
              />
            </div>
          </div>
          <ul className="queue-list">
            {data.queue.map((item, index) => (
              <li key={item.id}>
                <Link
                  className="queue-item"
                  href={nextUrl(item.id)}
                  aria-current={item.id === task.id ? "true" : undefined}
                >
                  <span className="queue-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="queue-main">
                    <span className="queue-id">{item.sourceId}</span>
                    <span className="queue-status">
                      {TASK_STATUS_LABELS[item.status as keyof typeof TASK_STATUS_LABELS] ??
                        item.status}
                      {item.annotationStatus
                        ? ` / ${item.annotationStatus.toLowerCase().replaceAll("_", " ")}`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className="record-panel" aria-label="Current record">
          {conflict ? (
            <div className="notice notice-danger stack" role="alert">
              <strong>This task changed elsewhere.</strong>
              <p className="small">
                Another tab, reviewer, or manager changed this work. Reloading
                replaces the local draft with the stored version.
              </p>
              <div className="cluster">
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  Reload latest
                </button>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="error-summary" role="alert">
              {errorMessage}
              {saveState === "error" ? (
                <div style={{ marginTop: "0.6rem" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => void saveNow(answer)}
                  >
                    Retry save
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {submitMessage ? (
            <div className="success-note" role="status">
              {submitMessage}{" "}
              {next ? (
                <Link href={nextUrl(next.id)}>Open the next task</Link>
              ) : (
                <Link
                  href={`/workspaces/${data.workspaceId}/projects/${data.projectId}/tasks`}
                >
                  Return to tasks
                </Link>
              )}
            </div>
          ) : null}

          {readOnly && !submitted ? (
            <div className="notice notice-warning">
              This task is {task.status.toLowerCase().replaceAll("_", " ")}. The
              answers are read-only while it moves through review, adjudication, or
              release.
            </div>
          ) : null}

          <div className="record-card">
            <div className="record-head">
              <div>
                <p className="eyebrow">Source record</p>
                <p className="mono" style={{ marginTop: "0.3rem" }}>
                  {task.sourceId}
                </p>
              </div>
              <span className="record-meta">source order {task.sourceOrder}</span>
            </div>
            <div className="record-body">
              {records.length === 0 ? (
                <p className="muted">This record has no fields.</p>
              ) : (
                records.map(([key, value], index) => (
                  <div className="source-field" key={key}>
                    <span className="source-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <span className="source-label">{key}</span>
                      <div className="source-text">{renderRecordValue(value)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="record-footer">
              <span>Schema v{task.schemaVersionNumber} pinned to this task</span>
              <span>{records.length} source fields</span>
            </div>
          </div>

          {data.annotation?.reviews.length ? (
            <div className="record-card">
              <div className="record-head">
                <p className="eyebrow">Review history</p>
                <span className="record-meta">
                  {data.annotation.reviews.length} decisions
                </span>
              </div>
              <div className="record-body feedback-list">
                {data.annotation.reviews.map((review) => (
                  <div className="feedback-item" key={review.id}>
                    <div className="spread">
                      <strong className="small">
                        {review.decision.toLowerCase().replaceAll("_", " ")}
                      </strong>
                      <span className="tiny muted">
                        {review.reviewerName} / {formatRelative(review.createdAt)}
                      </span>
                    </div>
                    {review.feedback ? (
                      <p className="small" style={{ marginTop: "0.35rem" }}>
                        {review.feedback}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="schema-panel" aria-label="Annotation questions">
          <div className="schema-panel-head">
            <p className="eyebrow">Annotation</p>
            <h2 className="display-sm">{task.schema.title}</h2>
            <span className="schema-panel-meta">
              Schema v{task.schemaVersionNumber} / {task.schema.fields.length}{" "}
              questions / required {task.requiredAnnotations}
            </span>
          </div>
          <div className="schema-body">
            <AnswerFields
              schema={task.schema}
              record={task.record}
              answer={answer}
              onChange={(next) => {
                setAnswer(next);
                setFieldErrors({});
              }}
              disabled={readOnly || saveState === "saving"}
              fieldErrors={fieldErrors}
            />
          </div>
          <div className="workbench-actions">
            <div className="save-line">
              <span className="mono tiny muted">{saveLabel}</span>
              <span className="mono tiny muted">
                revision {revisionRef.current}
              </span>
            </div>
            <div className="annotation-actions">
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => void saveNow(answer)}
                disabled={readOnly || saveState === "saving"}
              >
                Save draft
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={openSubmit}
                disabled={readOnly || submitting}
              >
                {submitting ? "Submitting..." : "Submit for review"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => helpRef.current?.showModal()}
              >
                Shortcuts
              </button>
            </div>
            <div className="keyboard-help">
              <span>
                <kbd>j</kbd> next
              </span>
              <span>
                <kbd>k</kbd> previous
              </span>
              <span>
                <kbd>Ctrl</kbd> <kbd>S</kbd> save
              </span>
              <span>
                <kbd>Ctrl</kbd> <kbd>Enter</kbd> submit
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="container" style={{ paddingBottom: "2rem" }}>
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <p className="tiny muted">
            Drafts autosave after a short pause. Navigation with j / k keeps the
            current draft.
          </p>
          <div className="cluster">
            {previous ? (
              <Link className="btn btn-secondary btn-sm" href={nextUrl(previous.id)}>
                Previous
              </Link>
            ) : null}
            {next ? (
              <Link className="btn btn-secondary btn-sm" href={nextUrl(next.id)}>
                Next
              </Link>
            ) : (
              <Link
                className="btn btn-secondary btn-sm"
                href={`/workspaces/${data.workspaceId}/projects/${data.projectId}/tasks`}
              >
                Task list
              </Link>
            )}
          </div>
        </div>
      </div>

      <dialog className="lf-dialog" ref={confirmRef} aria-labelledby="submit-confirm-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Submit for review</p>
            <h2 id="submit-confirm-title" className="display-sm">
              Submit {task.sourceId}?
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => confirmRef.current?.close()}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        <p className="small">
          Submission locks this task until a reviewer accepts it, returns it for
          correction, or sends it to adjudication. You can still see your answers.
        </p>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => confirmRef.current?.close()}
          >
            Keep editing
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={confirmSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Confirm submission"}
          </button>
        </div>
      </dialog>

      <dialog className="lf-dialog" ref={missingRef} aria-labelledby="missing-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Not ready</p>
            <h2 id="missing-title" className="display-sm">
              Complete required answers
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => missingRef.current?.close()}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        <div className="error-summary">
          {submitIssues.length === 0 ? (
            "Fix the highlighted answers before submitting."
          ) : (
            <ul>
              {submitIssues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="dialog-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => missingRef.current?.close()}
          >
            Return to answers
          </button>
        </div>
      </dialog>

      <dialog className="lf-dialog" ref={helpRef} aria-labelledby="help-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Keyboard</p>
            <h2 id="help-title" className="display-sm">
              Workbench shortcuts
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => helpRef.current?.close()}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        <ul className="limit-list">
          <li>
            <span>Next task</span>
            <strong>j or n</strong>
          </li>
          <li>
            <span>Previous task</span>
            <strong>k or p</strong>
          </li>
          <li>
            <span>Save now</span>
            <strong>Ctrl/Cmd + S</strong>
          </li>
          <li>
            <span>Submit</span>
            <strong>Ctrl/Cmd + Enter</strong>
          </li>
          <li>
            <span>This help</span>
            <strong>?</strong>
          </li>
        </ul>
        <p className="field-hint" style={{ marginTop: "0.7rem" }}>
          Shortcuts do not fire while typing in an answer field, except the save
          and submit combinations. Drafts autosave after a short pause.
        </p>
      </dialog>
    </div>
  );
}
