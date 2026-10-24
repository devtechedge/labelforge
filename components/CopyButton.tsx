"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <span className="cluster" style={{ gap: "0.4rem" }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
        {status === "copied" ? "Copied" : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "copied"
          ? "Copied to clipboard."
          : status === "failed"
            ? "Could not copy. Select the value and copy manually."
            : ""}
      </span>
    </span>
  );
}
