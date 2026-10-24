"use client";

import { useMemo, useRef, useState } from "react";

import type { SchemaField, SpanAnswer } from "@/domain/schema";

type SpanField = Extract<SchemaField, { type: "span" }>;

export function SpanEditor({
  field,
  sourceText,
  spans,
  onChange,
  disabled,
  describedBy,
}: {
  field: SpanField;
  sourceText: string | null;
  spans: SpanAnswer[];
  onChange: (spans: SpanAnswer[]) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(field.labels[0]?.value ?? "");
  const [pending, setPending] = useState<{ start: number; end: number; quote: string } | null>(
    null,
  );
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...spans].sort((a, b) => a.start - b.start || a.end - b.end),
    [spans],
  );

  function overlaps(start: number, end: number): boolean {
    return sorted.some((span) => start < span.end && end > span.start);
  }

  function addSpan(start: number, end: number, quote: string) {
    setError(null);
    if (!sourceText) {
      setError("This field has no source text to select.");
      return;
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > sourceText.length ||
      start >= end
    ) {
      setError("Offsets must be whole numbers inside the source text.");
      return;
    }
    if (quote !== sourceText.slice(start, end)) {
      setError("The selected quote no longer matches the source text. Select it again.");
      return;
    }
    if (overlaps(start, end)) {
      setError("Spans cannot overlap. Remove the overlapping span first.");
      return;
    }
    if (spans.length >= field.maxSpans) {
      setError(`Use at most ${field.maxSpans} spans.`);
      return;
    }
    if (!label) {
      setError("Choose a span label.");
      return;
    }
    onChange(
      [...spans, { start, end, label, quote }].sort(
        (a, b) => a.start - b.start || a.end - b.end,
      ),
    );
    setPending(null);
    setManualStart("");
    setManualEnd("");
    window.getSelection()?.removeAllRanges();
  }

  function captureSelection() {
    if (disabled || !sourceText) return;
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (
      range.collapsed ||
      !container.contains(range.startContainer) ||
      !container.contains(range.endContainer)
    ) {
      return;
    }
    const pre = document.createRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    pre.setEnd(range.endContainer, range.endOffset);
    const end = pre.toString().length;
    if (start >= end) return;
    setError(null);
    setPending({ start, end, quote: sourceText.slice(start, end) });
  }

  function addManual(event: React.FormEvent) {
    event.preventDefault();
    const start = Number(manualStart);
    const end = Number(manualEnd);
    if (!sourceText || manualStart === "" || manualEnd === "") {
      setError("Enter both offsets.");
      return;
    }
    addSpan(start, end, sourceText.slice(start, end));
  }

  function removeSpan(target: SpanAnswer) {
    onChange(spans.filter((span) => span !== target));
    setError(null);
  }

  if (sourceText === null) {
    return (
      <div className="notice notice-warning small">
        The source field &quot;{field.sourceField}&quot; is missing or is not text
        in this record. An administrator needs to correct the schema or dataset.
      </div>
    );
  }

  const segments: Array<
    | { type: "text"; text: string }
    | { type: "span"; text: string; span: SpanAnswer }
  > = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) {
      segments.push({ type: "text", text: sourceText.slice(cursor, span.start) });
    }
    segments.push({ type: "span", text: sourceText.slice(span.start, span.end), span });
    cursor = span.end;
  }
  if (cursor < sourceText.length) {
    segments.push({ type: "text", text: sourceText.slice(cursor) });
  }

  return (
    <div className="stack" style={{ gap: "0.6rem" }}>
      <div
        className="source-text panel panel-pad"
        ref={containerRef}
        onMouseUp={captureSelection}
        aria-describedby={describedBy}
      >
        {segments.length === 0 ? sourceText : null}
        {segments.map((segment, index) =>
          segment.type === "text" ? (
            <span key={`text-${index}`}>{segment.text}</span>
          ) : (
            <mark
              key={`span-${segment.span.start}-${segment.span.end}-${index}`}
              title={`${field.labels.find((item) => item.value === segment.span.label)?.label ?? segment.span.label}: ${segment.span.quote}`}
            >
              {segment.text}
            </mark>
          ),
        )}
      </div>
      <p className="field-hint">
        Select text above to create a span, or use the exact offsets below. Spans
        are checked against this source text when saved.
      </p>

      <div className="inline-fields">
        <div className="field">
          <label htmlFor={`${field.key}-span-label`}>Span label</label>
          <select
            className="select"
            id={`${field.key}-span-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={disabled}
          >
            {field.labels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${field.key}-manual-start`}>Start offset</label>
          <input
            className="input mono"
            id={`${field.key}-manual-start`}
            inputMode="numeric"
            value={manualStart}
            onChange={(event) => setManualStart(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={`${field.key}-manual-end`}>End offset</label>
          <input
            className="input mono"
            id={`${field.key}-manual-end`}
            inputMode="numeric"
            value={manualEnd}
            onChange={(event) => setManualEnd(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="field" style={{ alignSelf: "end" }}>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={addManual}
            disabled={disabled}
          >
            Add offset span
          </button>
        </div>
      </div>

      {pending ? (
        <div className="panel panel-pad stack" style={{ gap: "0.4rem" }}>
          <p className="field-label">Selected quote</p>
          <p className="small">&ldquo;{pending.quote}&rdquo;</p>
          <p className="mono tiny">
            Offsets {pending.start} to {pending.end}
          </p>
          <div className="cluster">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => addSpan(pending.start, pending.end, pending.quote)}
              disabled={disabled}
            >
              Add span with {field.labels.find((item) => item.value === label)?.label ?? label}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setPending(null)}
            >
              Discard selection
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {sorted.length > 0 ? (
        <ul className="list-reset stack" style={{ gap: "0.35rem" }}>
          {sorted.map((span) => (
            <li className="member-row" key={`${span.start}-${span.end}-${span.label}`}>
              <span className="small">
                <span className="role-pill">{span.label}</span>{" "}
                &ldquo;{span.quote}&rdquo;
              </span>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => removeSpan(span)}
                disabled={disabled}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
