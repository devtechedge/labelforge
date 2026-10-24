"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { formatBytes, formatDateTime } from "@/lib/format";

type ImportError = {
  rowNumber: number;
  field: string | null;
  code: string;
  message: string;
};

type ImportBatch = {
  id: string;
  fileName: string;
  format: "CSV" | "JSONL";
  status: string;
  byteSize: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  normalizationNotes: string[];
  errorsTruncated: boolean;
  errors: ImportError[];
  sampleRows: Array<{
    rowNumber: number;
    sourceId: string | null;
    valid: boolean;
    errorCode: string | null;
  }>;
  expiresAt: string;
  committedAt: string | null;
  committedVersionId: string | null;
  sourceChecksum: string;
  createdAt: string;
};

type CommitResult = {
  versionId: string;
  versionNumber: number;
  recordCount: number;
  contentChecksum: string;
};

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function ImportWorkbench({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("auto");
  const [delimiter, setDelimiter] = useState(",");
  const [idField, setIdField] = useState("");
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [commit, setCommit] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const fileTooLarge = Boolean(file && file.size > 4 * 1024 * 1024);

  async function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCommit(null);
    setBatch(null);
    if (!file) {
      setError("Choose a CSV or JSONL file first.");
      return;
    }
    if (fileTooLarge) {
      setError("This deployment accepts files up to 4 MB.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    if (format !== "auto") body.set("format", format);
    body.set("delimiter", delimiter);
    if (idField.trim()) body.set("idField", idField.trim());

    setBusy("preview");
    try {
      const response = await fetch(`/api/projects/${projectId}/imports/preview`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const data = (await response.json()) as { batch: ImportBatch };
      setBatch(data.batch);
    } catch {
      setError("The upload failed before it reached the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function commitBatch() {
    if (!batch) return;
    setError(null);
    setBusy("commit");
    try {
      const response = await fetch(`/api/projects/${projectId}/imports/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const data = (await response.json()) as { version: CommitResult };
      setCommit(data.version);
      setBatch(null);
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      router.refresh();
    } catch {
      setError("The commit failed before it reached the server. The preview may still be available.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack-lg">
      <div className="split">
        <form className="card card-pad stack" onSubmit={preview}>
          <div>
            <p className="eyebrow">Step 1</p>
            <h2 className="display-sm">Validate the file</h2>
          </div>
          <div className="dropzone">
            <label className="field-label" htmlFor="import-file">
              CSV or JSONL file
            </label>
            <input
              ref={inputRef}
              className="file-input"
              id="import-file"
              type="file"
              accept=".csv,.jsonl,.ndjson,text/csv,application/x-ndjson"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              aria-describedby="import-file-help"
            />
            <p className="field-hint" id="import-file-help">
              Up to 4 MB, 10,000 records. UTF-8 only. CSV headers are required.
            </p>
            {file ? (
              <p className="file-name">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
          </div>
          {fileTooLarge ? (
            <p className="error-summary">This file is larger than the 4 MB limit.</p>
          ) : null}

          <div className="form-grid two">
            <div className="field">
              <label htmlFor="import-format">Format</label>
              <select
                className="select"
                id="import-format"
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="auto">Detect from extension</option>
                <option value="CSV">CSV</option>
                <option value="JSONL">JSONL</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="import-delimiter">CSV delimiter</label>
              <select
                className="select"
                id="import-delimiter"
                value={delimiter}
                onChange={(event) => setDelimiter(event.target.value)}
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={"\t"}>Tab</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="import-id-field">Identity field (optional)</label>
            <input
              className="input"
              id="import-id-field"
              value={idField}
              onChange={(event) => setIdField(event.target.value)}
              placeholder="Detected from id, record_id, uid, key"
              maxLength={80}
            />
            <p className="field-hint">
              If no identity field is available, LabelForge records a positional
              row-N identifier and says so in the preview.
            </p>
          </div>

          <div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy !== null || !file || fileTooLarge}
            >
              {busy === "preview" ? "Parsing and validating..." : "Preview import"}
            </button>
          </div>
          <p className="field-hint">
            Previewing parses the uploaded bytes on the server. It does not write
            dataset records.
          </p>
        </form>

        <div className="card card-pad stack">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 className="display-sm">Decide what commits</h2>
          </div>
          {error ? (
            <div className="error-summary" role="alert">
              {error}
            </div>
          ) : null}
          {commit ? (
            <div className="stack">
              <div className="success-note" role="status">
                Dataset version v{commit.versionNumber} committed with{" "}
                {commit.recordCount} records.
              </div>
              <p className="small">
                Next, publish a schema and generate tasks for this dataset version.
              </p>
              <div className="cluster">
                <Link className="btn btn-primary" href={`${base}/schema`}>
                  Open schema
                </Link>
                <Link className="btn btn-secondary" href={`${base}/tasks`}>
                  Open tasks
                </Link>
              </div>
              <p className="mono tiny" style={{ overflowWrap: "anywhere" }}>
                content checksum {commit.contentChecksum}
              </p>
            </div>
          ) : !batch ? (
            <div className="empty-state" style={{ padding: "1.4rem" }}>
              <p className="eyebrow">No preview yet</p>
              <p className="small muted">
                Upload a file to see row counts, quarantine reasons, identity
                normalization, and exactly what would be committed.
              </p>
            </div>
          ) : (
            <div className="stack">
              <div className="grid-2">
                <div className="stat">
                  <span className="stat-value">{batch.totalRows}</span>
                  <span className="stat-label">Rows read</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{batch.validRows}</span>
                  <span className="stat-label">Valid</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{batch.invalidRows}</span>
                  <span className="stat-label">Quarantined</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{batch.duplicateRows}</span>
                  <span className="stat-label">Duplicates</span>
                </div>
              </div>

              <div className="notice small">
                Commit imports valid rows only. Invalid rows stay listed here and
                are not written to the dataset. Preview expires{" "}
                {formatDateTime(batch.expiresAt)}.
              </div>

              {batch.normalizationNotes.length > 0 ? (
                <div className="panel panel-pad">
                  <p className="field-label">Normalization decisions</p>
                  <ul className="small" style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
                    {batch.normalizationNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {batch.errors.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <caption className="sr-only">Import row errors</caption>
                    <thead>
                      <tr>
                        <th scope="col">Row</th>
                        <th scope="col">Field</th>
                        <th scope="col">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.errors.map((item) => (
                        <tr key={`${item.rowNumber}-${item.code}`}>
                          <td className="mono">{item.rowNumber}</td>
                          <td className="mono tiny">{item.field ?? "record"}</td>
                          <td>
                            <span className="mono tiny">{item.code}</span>
                            <br />
                            {item.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {batch.errorsTruncated ? (
                <p className="tiny muted">
                  Showing the first {batch.errors.length} row errors. All rows are
                  still counted above.
                </p>
              ) : null}

              <button
                className="btn btn-primary"
                type="button"
                onClick={commitBatch}
                disabled={batch.validRows === 0 || busy !== null || batch.status !== "PREVIEW_READY"}
              >
                {busy === "commit"
                  ? "Committing records..."
                  : `Commit ${batch.validRows} valid rows`}
              </button>
              {batch.validRows === 0 ? (
                <p className="field-hint">
                  There are no valid rows in this preview. Fix the file and upload
                  it again.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
