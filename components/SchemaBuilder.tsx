"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { schemaTypeLabel } from "@/domain/schema";
import type { FieldType } from "@/domain/schema";

type DraftField = {
  id: string;
  type: FieldType;
  key: string;
  label: string;
  required: boolean;
  optionsText: string;
  sourceField: string;
  maxLength: string;
  maxSpans: string;
  min: string;
  max: string;
};

function newField(index: number): DraftField {
  return {
    id: crypto.randomUUID(),
    type: "single_select",
    key: `field_${index}`,
    label: `Field ${index}`,
    required: true,
    optionsText: "option_one|Option one\noption_two|Option two",
    sourceField: "review_text",
    maxLength: "2000",
    maxSpans: "10",
    min: "",
    max: "",
  };
}

function parseOptions(text: string): Array<{ value: string; label: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, ...labelParts] = line.split("|");
      const value = (rawValue ?? "").trim();
      const label = labelParts.join("|").trim() || value;
      return { value, label };
    });
}

function fieldToSchema(field: DraftField) {
  const base = {
    key: field.key.trim(),
    label: field.label.trim(),
    required: field.required,
  };
  switch (field.type) {
    case "single_select":
    case "multi_select":
      return { ...base, type: field.type, options: parseOptions(field.optionsText) };
    case "text":
      return { ...base, type: field.type, maxLength: Number(field.maxLength) || 2000 };
    case "number":
      return {
        ...base,
        type: field.type,
        ...(field.min !== "" ? { min: Number(field.min) } : {}),
        ...(field.max !== "" ? { max: Number(field.max) } : {}),
      };
    case "boolean":
      return { ...base, type: field.type };
    case "span":
      return {
        ...base,
        type: field.type,
        sourceField: field.sourceField.trim(),
        labels: parseOptions(field.optionsText),
        maxSpans: Number(field.maxSpans) || 10,
      };
  }
}

export function SchemaBuilder({
  projectId,
  sampleFields,
}: {
  projectId: string;
  sampleFields: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("Annotation schema");
  const [instructions, setInstructions] = useState("");
  const [fields, setFields] = useState<DraftField[]>([
    {
      id: "field-initial",
      type: "single_select",
      key: "category",
      label: "Category",
      required: true,
      optionsText: "bug|Bug\nfeature|Feature request\nbilling|Billing\npraise|Praise",
      sourceField: sampleFields[0] ?? "text",
      maxLength: "2000",
      maxSpans: "10",
      min: "",
      max: "",
    },
  ]);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateField(id: string, patch: Partial<DraftField>) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function build() {
    const problems: string[] = [];
    if (!title.trim()) problems.push("Give the schema a title.");
    if (fields.length === 0) problems.push("Add at least one field.");
    const keys = new Set<string>();
    for (const field of fields) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key.trim())) {
        problems.push(`"${field.key || "field"}" needs a lowercase key.`);
      }
      if (keys.has(field.key.trim())) {
        problems.push(`The key "${field.key}" is used twice.`);
      }
      keys.add(field.key.trim());
      if (!field.label.trim()) problems.push("Every field needs a label.");
      if (
        (field.type === "single_select" ||
          field.type === "multi_select" ||
          field.type === "span") &&
        parseOptions(field.optionsText).length < (field.type === "span" ? 1 : 2)
      ) {
        problems.push(`"${field.label}" needs ${field.type === "span" ? "a label" : "at least two options"}.`);
      }
      if (field.type === "span" && !field.sourceField.trim()) {
        problems.push(`"${field.label}" needs a source text field.`);
      }
    }

    const schema = {
      kind: "labelforge.annotation-schema" as const,
      version: 1 as const,
      title: title.trim(),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      fields: fields.map(fieldToSchema),
    };
    return { schema, problems };
  }

  const { schema, problems } = build();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/schemas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { schema?: { versionNumber: number }; error?: { message?: string; details?: { issues?: Array<{ path: string; message: string }> } } }
        | null;
      if (!response.ok) {
        const issues = payload?.error?.details?.issues;
        setErrors(
          issues && issues.length > 0
            ? issues.map((issue) => `${issue.path}: ${issue.message}`)
            : [payload?.error?.message ?? "The schema could not be created."],
        );
        return;
      }
      setSuccess(
        `Draft schema v${payload?.schema?.versionNumber ?? ""} created. Review it below, then publish it.`,
      );
      router.refresh();
    } catch {
      setErrors(["The schema request failed before it reached the server."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad stack-lg" onSubmit={submit}>
      <div className="stack">
        <p className="eyebrow">New schema version</p>
        <h2 className="display-sm">Define the questions</h2>
        <p className="small muted">
          New versions are immutable. Tasks already pinned to an older version
          keep their answers readable under that exact schema.
        </p>
      </div>

      {errors.length > 0 ? (
        <div className="error-summary" role="alert">
          <strong>Fix these before saving</strong>
          <ul>
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {success ? (
        <div className="success-note" role="status">
          {success}
        </div>
      ) : null}

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="schema-title">Schema title</label>
          <input
            className="input"
            id="schema-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="schema-instructions">Instructions (optional)</label>
          <input
            className="input"
            id="schema-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={2000}
            placeholder="Short guidance shown to annotators"
          />
        </div>
      </div>

      <div className="schema-builder">
        {fields.map((field, index) => (
          <fieldset className="schema-field-row" key={field.id}>
            <legend className="field-label">Field {index + 1}</legend>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor={`field-label-${field.id}`}>Label</label>
                <input
                  className="input"
                  id={`field-label-${field.id}`}
                  value={field.label}
                  onChange={(event) =>
                    updateField(field.id, { label: event.target.value })
                  }
                  maxLength={120}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`field-key-${field.id}`}>Key</label>
                <input
                  className="input mono"
                  id={`field-key-${field.id}`}
                  value={field.key}
                  onChange={(event) => updateField(field.id, { key: event.target.value })}
                  pattern="[a-z][a-z0-9_]{0,39}"
                  maxLength={40}
                  required
                />
              </div>
            </div>

            <div className="inline-fields">
              <div className="field">
                <label htmlFor={`field-type-${field.id}`}>Type</label>
                <select
                  className="select"
                  id={`field-type-${field.id}`}
                  value={field.type}
                  onChange={(event) =>
                    updateField(field.id, {
                      type: event.target.value as FieldType,
                    })
                  }
                >
                  {(
                    [
                      "single_select",
                      "multi_select",
                      "text",
                      "number",
                      "boolean",
                      "span",
                    ] as FieldType[]
                  ).map((type) => (
                    <option key={type} value={type}>
                      {schemaTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="check-row" style={{ alignSelf: "end" }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    updateField(field.id, { required: event.target.checked })
                  }
                />
                <span>Required</span>
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: "end" }}
                onClick={() =>
                  setFields((current) => current.filter((item) => item.id !== field.id))
                }
                disabled={fields.length === 1}
              >
                Remove field
              </button>
            </div>

            {field.type === "single_select" ||
            field.type === "multi_select" ||
            field.type === "span" ? (
              <div className="field">
                <label htmlFor={`field-options-${field.id}`}>
                  {field.type === "span" ? "Span labels" : "Options"} (value|label per line)
                </label>
                <textarea
                  className="textarea mono"
                  id={`field-options-${field.id}`}
                  value={field.optionsText}
                  onChange={(event) =>
                    updateField(field.id, { optionsText: event.target.value })
                  }
                  rows={4}
                />
              </div>
            ) : null}

            {field.type === "text" ? (
              <div className="field" style={{ maxWidth: "12rem" }}>
                <label htmlFor={`field-max-${field.id}`}>Maximum length</label>
                <input
                  className="input"
                  id={`field-max-${field.id}`}
                  type="number"
                  min={1}
                  max={8000}
                  value={field.maxLength}
                  onChange={(event) =>
                    updateField(field.id, { maxLength: event.target.value })
                  }
                />
              </div>
            ) : null}

            {field.type === "number" ? (
              <div className="inline-fields">
                <div className="field">
                  <label htmlFor={`field-min-${field.id}`}>Minimum (optional)</label>
                  <input
                    className="input"
                    id={`field-min-${field.id}`}
                    type="number"
                    value={field.min}
                    onChange={(event) => updateField(field.id, { min: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`field-maxnum-${field.id}`}>Maximum (optional)</label>
                  <input
                    className="input"
                    id={`field-maxnum-${field.id}`}
                    type="number"
                    value={field.max}
                    onChange={(event) => updateField(field.id, { max: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {field.type === "span" ? (
              <div className="inline-fields">
                <div className="field">
                  <label htmlFor={`field-source-${field.id}`}>Source text field</label>
                  <input
                    className="input mono"
                    id={`field-source-${field.id}`}
                    value={field.sourceField}
                    list={`source-fields-${field.id}`}
                    onChange={(event) =>
                      updateField(field.id, { sourceField: event.target.value })
                    }
                  />
                  <datalist id={`source-fields-${field.id}`}>
                    {sampleFields.map((sourceField) => (
                      <option key={sourceField} value={sourceField} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor={`field-maxspans-${field.id}`}>Maximum spans</label>
                  <input
                    className="input"
                    id={`field-maxspans-${field.id}`}
                    type="number"
                    min={1}
                    max={20}
                    value={field.maxSpans}
                    onChange={(event) =>
                      updateField(field.id, { maxSpans: event.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
        ))}

        <div className="cluster">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setFields((current) => [...current, newField(current.length + 1)])}
          >
            Add field
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating draft..." : "Create draft schema"}
          </button>
        </div>
      </div>

      <details className="panel panel-pad">
        <summary className="field-label" style={{ cursor: "pointer" }}>
          Preview schema JSON
        </summary>
        <pre className="code-card" style={{ marginTop: "0.8rem" }}>
          {JSON.stringify(schema, null, 2)}
        </pre>
      </details>
    </form>
  );
}
