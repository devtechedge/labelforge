"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function BeginReviewButton({
  annotationId,
}: {
  annotationId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/annotations/${annotationId}/begin-review`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      router.refresh();
    } catch {
      setError("The review could not begin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <button className="btn btn-secondary btn-sm" type="button" onClick={begin} disabled={busy}>
        {busy ? "Opening..." : "Begin review"}
      </button>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

const DECISIONS = [
  {
    value: "PASS",
    label: "Accept",
    description: "The submission is correct and can move to release eligibility.",
  },
  {
    value: "RETURN_FOR_CORRECTION",
    label: "Return for correction",
    description: "The annotator must revise specific answers and resubmit.",
  },
  {
    value: "REJECT",
    label: "Reject",
    description: "The submission is unusable for this task.",
  },
  {
    value: "REQUEST_ADJUDICATION",
    label: "Request adjudication",
    description: "Send the disagreement to a manager or reviewer for a final answer.",
  },
] as const;

export function ReviewDecisionForm({
  annotationId,
  expectedRevision,
  annotatorName,
  afterDecisionHref,
}: {
  annotationId: string;
  expectedRevision: number;
  annotatorName: string;
  afterDecisionHref: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]["value"]>("PASS");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (decision !== "PASS" && feedback.trim().length < 10) {
      setError("Write at least 10 characters of feedback for this decision.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/annotations/${annotationId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          feedback: feedback.trim() || undefined,
          expectedRevision,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const body = (await response.json()) as { taskStatus: string };
      setMessage(`Decision recorded. Task is now ${body.taskStatus.toLowerCase().replaceAll("_", " ")}.`);
      setFeedback("");
      router.replace(afterDecisionHref);
    } catch {
      setError("The review decision failed before it reached the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="field-label">Review {annotatorName}&apos;s submission</p>
      <fieldset className="schema-options">
        <legend className="sr-only">Review decision</legend>
        {DECISIONS.map((option) => (
          <label className="choice-card" key={option.value}>
            <input
              type="radio"
              name={`decision-${annotationId}`}
              value={option.value}
              checked={decision === option.value}
              onChange={() => setDecision(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`feedback-${annotationId}`}>
          Feedback{" "}
          {decision === "PASS" ? "(optional)" : "(required, at least 10 characters)"}
        </label>
        <textarea
          className="textarea"
          id={`feedback-${annotationId}`}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={2000}
          required={decision !== "PASS"}
        />
      </div>
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
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Recording decision..." : "Record decision"}
        </button>
      </div>
      <p className="field-hint">
        The decision is checked against revision {expectedRevision}. If the
        annotation changed first, the request is rejected.
      </p>
    </form>
  );
}
