"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AnswerFields } from "@/components/AnswerFields";
import type { AnnotationAnswer, AnnotationSchema } from "@/domain/schema";

type AnnotationOption = {
  id: string;
  annotatorName: string;
  status: string;
  answer: AnnotationAnswer;
};

async function readError(response: Response): Promise<{
  message: string;
  issues: Array<{ field: string; message: string }>;
}> {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
        details?: {
          issues?: Array<{ path?: unknown; message?: unknown }>;
          missing?: Array<{ field?: unknown; message?: unknown }>;
        };
      };
    };
    const raw = payload.error?.details?.issues ?? payload.error?.details?.missing ?? [];
    return {
      message: payload.error?.message ?? `Request failed with status ${response.status}.`,
      issues: raw.map((issue) => {
        const path = "path" in issue && typeof issue.path === "string" ? issue.path : null;
        const field = "field" in issue && typeof issue.field === "string" ? issue.field : null;
        return {
          field: path ?? field ?? "_form",
          message: typeof issue.message === "string" ? issue.message : "Invalid answer.",
        };
      }),
    };
  } catch {
    return { message: `Request failed with status ${response.status}.`, issues: [] };
  }
}

export function BeginAdjudicationButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/begin-adjudication`, {
        method: "POST",
      });
      if (!response.ok) {
        setError((await readError(response)).message);
        return;
      }
      router.refresh();
    } catch {
      setError("The adjudication could not begin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <button className="btn btn-primary" type="button" onClick={begin} disabled={busy}>
        {busy ? "Opening adjudication..." : "Begin adjudication"}
      </button>
      <p className="field-hint">
        This moves the task from Disputed to Adjudication and is recorded in the
        audit log. The annotations stay unchanged.
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdjudicationForm({
  taskId,
  taskVersion,
  schema,
  record,
  annotations,
}: {
  taskId: string;
  taskVersion: number;
  schema: AnnotationSchema;
  record: Record<string, unknown>;
  annotations: AnnotationOption[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [answer, setAnswer] = useState<AnnotationAnswer>(annotations[0]?.answer ?? {});
  const [rationale, setRationale] = useState("");
  const [chosenAnnotationId, setChosenAnnotationId] = useState<string>(
    annotations[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  function openConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (rationale.trim().length < 20) {
      setError("Write at least 20 characters of rationale for the final answer.");
      return;
    }
    dialogRef.current?.showModal();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/adjudicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalAnswer: answer,
          rationale: rationale.trim(),
          expectedTaskVersion: taskVersion,
          chosenAnnotationId: chosenAnnotationId || null,
        }),
      });
      if (!response.ok) {
        const parsed = await readError(response);
        setIssues(parsed.issues);
        setError(parsed.message);
        dialogRef.current?.close();
        return;
      }
      setMessage("Adjudication recorded. The task is resolved and eligible for release.");
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("The adjudication failed before it reached the server.");
      dialogRef.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad stack-lg" onSubmit={openConfirm}>
      <div className="stack">
        <p className="eyebrow">Final decision</p>
        <h3 className="display-sm">Write the answer that will be released</h3>
        <p className="small muted">
          Start from an annotation if it is correct, or correct the answer. Your
          rationale and the chosen evidence are stored with the final answer.
        </p>
      </div>

      {annotations.length > 0 ? (
        <div className="panel panel-pad stack">
          <p className="field-label">Starting point</p>
          <div className="cluster">
            {annotations.map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                className={`btn btn-sm ${
                  chosenAnnotationId === annotation.id ? "btn-primary" : "btn-secondary"
                }`}
                onClick={() => {
                  setChosenAnnotationId(annotation.id);
                  setAnswer(annotation.answer);
                }}
              >
                Use {annotation.annotatorName}&apos;s answer
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setChosenAnnotationId("");
                setAnswer({});
              }}
            >
              Start fresh
            </button>
          </div>
        </div>
      ) : null}

      <AnswerFields
        schema={schema}
        record={record}
        answer={answer}
        onChange={(next) => {
          setAnswer(next);
          setIssues([]);
        }}
        fieldErrors={Object.fromEntries(issues.map((issue) => [issue.field, issue.message]))}
      />

      <div className="field">
        <label htmlFor="adjudication-rationale">
          Rationale (required, at least 20 characters)
        </label>
        <textarea
          className="textarea"
          id="adjudication-rationale"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          maxLength={2000}
          required
          minLength={20}
        />
        <p className="field-hint">
          Cite the evidence that resolves the disagreement. The rationale appears
          in the task history.
        </p>
      </div>

      {message ? (
        <div className="success-note" role="status">
          {message}{" "}
          <a href={`/workspaces`}>Return to workspaces</a>
        </div>
      ) : null}
      {error ? (
        <div className="error-summary" role="alert">
          {error}
          {issues.length > 0 ? (
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Review final answer
        </button>
      </div>

      <dialog className="lf-dialog" ref={dialogRef} aria-labelledby="adjudication-confirm-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Final and immutable</p>
            <h2 id="adjudication-confirm-title" className="display-sm">
              Resolve this task?
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        <p className="small">
          This answer becomes the task&apos;s final answer, moves it to Resolved,
          and makes it eligible for the next dataset release. The annotation and
          review history stays intact.
        </p>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Keep editing
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Recording..." : "Resolve task"}
          </button>
        </div>
      </dialog>
    </form>
  );
}
