"use client";

import { useActionState, useEffect, useRef } from "react";

import { CopyButton } from "@/components/CopyButton";
import type { FormActionState } from "@/lib/action-state";

type Action = (
  state: FormActionState,
  formData: FormData,
) => Promise<FormActionState>;

export function ActionForm({
  action,
  children,
  className = "form-grid",
  formId,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  formId?: string;
}) {
  const [state, formAction] = useActionState(action, {
    error: undefined,
    message: undefined,
    fieldErrors: undefined,
    inviteUrl: undefined,
  } satisfies FormActionState);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  const fieldErrorList = state.fieldErrors
    ? Object.entries(state.fieldErrors).filter(([, value]) => Boolean(value))
    : [];

  return (
    <form id={formId} action={formAction} className={className}>
      {state.error ? (
        <div
          className="error-summary"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          <strong>{state.error}</strong>
          {fieldErrorList.length > 0 ? (
            <ul>
              {fieldErrorList.map(([field, message]) => (
                <li key={field}>
                  {message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state.message ? (
        <div className="success-note" role="status">
          {state.message}
        </div>
      ) : null}

      {state.inviteUrl ? (
        <div className="panel-pad stack">
          <p className="field-label">Invitation link</p>
          <div className="cluster" style={{ flexWrap: "nowrap" }}>
            <input
              className="input mono"
              value={state.inviteUrl}
              readOnly
              aria-label="Invitation link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <CopyButton value={state.inviteUrl} label="Copy link" />
          </div>
          <p className="field-hint">
            This link is shown once. It expires in seven days and only the invited
            email can accept it.
          </p>
        </div>
      ) : null}

      {children}
    </form>
  );
}
