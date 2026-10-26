"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; details?: { exclusions?: Record<string, number> } };
    };
    const exclusions = body.error?.details?.exclusions;
    const detail =
      exclusions && Object.keys(exclusions).length > 0
        ? ` Exclusions: ${Object.entries(exclusions)
            .filter(([, count]) => count > 0)
            .map(([reason, count]) => `${reason.replaceAll("_", " ")} (${count})`)
            .join(", ")}.`
        : "";
    return (body.error?.message ?? `Request failed with status ${response.status}.`) + detail;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function ReleasePublisher({
  workspaceId,
  projectId,
  schemas,
  datasetVersions,
}: {
  workspaceId: string;
  projectId: string;
  schemas: Array<{ id: string; versionNumber: number }>;
  datasetVersions: Array<{ id: string; versionNumber: number; recordCount: number }>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [schemaVersionId, setSchemaVersionId] = useState("");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const effectiveSchemaVersionId = schemaVersionId || schemas[0]?.id || "";
  const effectiveDatasetVersionId = datasetVersionId || datasetVersions[0]?.id || "";
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    releaseId: string;
    versionNumber: number;
    recordCount: number;
    excludedCount: number;
    checksum: string;
  } | null>(null);

  if (schemas.length === 0 || datasetVersions.length === 0) {
    return (
      <div className="notice notice-warning small">
        A release needs a committed dataset version and a published schema. Finish
        the import and schema steps first.
      </div>
    );
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersionId: effectiveSchemaVersionId,
          datasetVersionId: effectiveDatasetVersionId,
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        dialogRef.current?.close();
        return;
      }
      const body = (await response.json()) as {
        release: {
          releaseId: string;
          versionNumber: number;
          recordCount: number;
          excludedCount: number;
          checksum: string;
        };
      };
      setResult(body.release);
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("The release request failed before it reached the server.");
      dialogRef.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad stack">
      <div>
        <p className="eyebrow">Create a snapshot</p>
        <h3 className="display-sm">Publish a dataset release</h3>
        <p className="small muted">
          The release stores accepted and adjudicated answers as immutable snapshot
          rows with JSONL and CSV checksums. It never follows later edits.
        </p>
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="release-schema">Schema version</label>
          <select
            className="select"
            id="release-schema"
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
          <label htmlFor="release-dataset">Dataset version</label>
          <select
            className="select"
            id="release-dataset"
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
      <div className="field">
        <label htmlFor="release-notes">Release notes (optional)</label>
        <input
          className="input"
          id="release-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          placeholder="Context for the team reviewing this release"
        />
      </div>

      {result ? (
        <div className="success-note stack" role="status">
          <span>
            Release v{result.versionNumber} published with {result.recordCount}{" "}
            records and {result.excludedCount} excluded tasks.
          </span>
          <span className="mono tiny" style={{ overflowWrap: "anywhere" }}>
            SHA-256 {result.checksum}
          </span>
          <Link
            className="btn btn-secondary btn-sm"
            href={`/workspaces/${workspaceId}/projects/${projectId}/releases`}
          >
            View in release history
          </Link>
        </div>
      ) : null}
      {error ? (
        <div className="error-summary" role="alert">
          {error}
        </div>
      ) : null}

      <div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          disabled={busy}
        >
          Publish release
        </button>
      </div>

      <dialog className="lf-dialog" ref={dialogRef} aria-labelledby="release-confirm-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Immutable snapshot</p>
            <h2 id="release-confirm-title" className="display-sm">
              Publish this release?
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
          Only accepted tasks where all required annotations agree, plus resolved
          adjudications, are included. Other tasks are counted as excluded. Once
          published, these bytes and the manifest are frozen.
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
            onClick={publish}
            disabled={busy}
          >
            {busy ? "Publishing..." : "Publish immutable release"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
