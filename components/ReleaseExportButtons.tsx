"use client";

import { useState } from "react";

type Format = "bundle" | "jsonl" | "csv" | "manifest";

const LABELS: Record<Format, string> = {
  bundle: "Download release bundle",
  jsonl: "JSONL",
  csv: "CSV",
  manifest: "Manifest JSON",
};

export function ReleaseExportButtons({
  releaseId,
  versionNumber,
}: {
  releaseId: string;
  versionNumber: number;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function download(format: Format) {
    setBusy(format);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/releases/${releaseId}/export?format=${format}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "The export failed. Try again.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const nameMatch = /filename="([^"]+)"/.exec(disposition);
      const extension = format === "bundle" ? "zip" : format === "manifest" ? "json" : format;
      const filename =
        nameMatch?.[1] ?? `labelforge-release-${versionNumber}.${extension}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Download started for ${filename}.`);
    } catch {
      setError(
        "The export request failed before it reached the server. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="cluster">
        {(Object.keys(LABELS) as Format[]).map((format) => (
          <button
            key={format}
            className={`btn btn-sm ${format === "bundle" ? "btn-primary" : format === "manifest" ? "btn-ghost" : "btn-secondary"}`}
            type="button"
            onClick={() => download(format)}
            disabled={busy !== null}
          >
            {busy === format ? "Preparing..." : LABELS[format]}
          </button>
        ))}
      </div>
      {message ? (
        <p className="tiny" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
