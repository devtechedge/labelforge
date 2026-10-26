"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function PublishSchemaButton({
  projectId,
  schemaVersionId,
  versionNumber,
  afterPublishHref,
}: {
  projectId: string;
  schemaVersionId: string;
  versionNumber: number;
  afterPublishHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: string }>({
    busy: false,
  });

  async function publish() {
    setState({ busy: true });
    try {
      const response = await fetch(`/api/projects/${projectId}/publish-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersionId }),
      });
      if (!response.ok) {
        setState({ busy: false, error: await readError(response) });
        return;
      }
      setState({ busy: false, message: `Schema v${versionNumber} published.` });
      router.replace(afterPublishHref);
    } catch {
      setState({ busy: false, error: "The publish request failed." });
    }
  }

  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <button
        className="btn btn-primary btn-sm"
        type="button"
        onClick={publish}
        disabled={state.busy}
      >
        {state.busy ? "Publishing..." : `Publish v${versionNumber}`}
      </button>
      {state.message ? (
        <span className="tiny" role="status">
          {state.message}
        </span>
      ) : null}
      {state.error ? (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

export function ApplySchemaButton({
  projectId,
  schemaVersionId,
  versionNumber,
}: {
  projectId: string;
  schemaVersionId: string;
  versionNumber: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: string }>({
    busy: false,
  });

  async function apply() {
    setState({ busy: true });
    try {
      const response = await fetch(`/api/projects/${projectId}/apply-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersionId }),
      });
      if (!response.ok) {
        setState({ busy: false, error: await readError(response) });
        return;
      }
      const body = (await response.json()) as { updated: number };
      setState({
        busy: false,
        message: `${body.updated} unstarted task${body.updated === 1 ? "" : "s"} moved to v${versionNumber}.`,
      });
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setState({ busy: false, error: "The schema apply request failed." });
    }
  }

  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Apply to unstarted
      </button>
      {state.message ? (
        <span className="tiny" role="status">
          {state.message}
        </span>
      ) : null}
      {state.error ? (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      ) : null}
      <dialog
        className="lf-dialog"
        ref={dialogRef}
        aria-labelledby={`apply-title-${schemaVersionId}`}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Schema migration</p>
            <h2 id={`apply-title-${schemaVersionId}`} className="display-sm">
              Move unstarted tasks to v{versionNumber}?
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
          Only tasks with no saved answers and a status of Unassigned or Assigned
          will move. Tasks with any annotation history stay pinned to their
          original schema. This action is audited.
        </p>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={apply}
            disabled={state.busy}
          >
            {state.busy ? "Applying..." : `Apply v${versionNumber}`}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export function GenerateTasksPanel({
  projectId,
  schemas,
  datasetVersions,
}: {
  projectId: string;
  schemas: Array<{ id: string; versionNumber: number }>;
  datasetVersions: Array<{ id: string; versionNumber: number; recordCount: number }>;
}) {
  const router = useRouter();
  const [schemaVersionId, setSchemaVersionId] = useState("");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const effectiveSchemaVersionId = schemaVersionId || schemas[0]?.id || "";
  const effectiveDatasetVersionId = datasetVersionId || datasetVersions[0]?.id || "";
  const [state, setState] = useState<{
    busy: boolean;
    message?: string;
    error?: string;
  }>({ busy: false });

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ busy: true });
    try {
      const response = await fetch(`/api/projects/${projectId}/generate-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersionId: effectiveSchemaVersionId,
          datasetVersionId: effectiveDatasetVersionId,
        }),
      });
      if (!response.ok) {
        setState({ busy: false, error: await readError(response) });
        return;
      }
      const body = (await response.json()) as { created: number; skipped: number };
      setState({
        busy: false,
        message: `${body.created} task${body.created === 1 ? "" : "s"} created. ${body.skipped} already existed.`,
      });
      router.refresh();
    } catch {
      setState({ busy: false, error: "The task generation request failed." });
    }
  }

  if (schemas.length === 0 || datasetVersions.length === 0) {
    return (
      <p className="small muted">
        Publish a schema and commit a dataset version before generating tasks.
      </p>
    );
  }

  return (
    <form className="stack" onSubmit={generate}>
      <div className="form-grid two">
        <div className="field">
          <label htmlFor="generate-schema">Published schema</label>
          <select
            className="select"
            id="generate-schema"
            value={effectiveSchemaVersionId}
            onChange={(event) => setSchemaVersionId(event.target.value)}
          >
            {schemas.map((schema) => (
              <option key={schema.id} value={schema.id}>
                Schema v{schema.versionNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="generate-dataset">Dataset version</label>
          <select
            className="select"
            id="generate-dataset"
            value={effectiveDatasetVersionId}
            onChange={(event) => setDatasetVersionId(event.target.value)}
          >
            {datasetVersions.map((version) => (
              <option key={version.id} value={version.id}>
                Dataset v{version.versionNumber} ({version.recordCount} records)
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.message ? (
        <div className="success-note" role="status">
          {state.message}
        </div>
      ) : null}
      {state.error ? (
        <div className="error-summary" role="alert">
          {state.error}
        </div>
      ) : null}
      <div>
        <button className="btn btn-primary" type="submit" disabled={state.busy}>
          {state.busy ? "Generating..." : "Generate tasks"}
        </button>
      </div>
      <p className="field-hint">
        Existing tasks for the same record and schema are skipped. The unique
        record and schema pair is enforced in PostgreSQL.
      </p>
    </form>
  );
}
