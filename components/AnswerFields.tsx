"use client";

import { SpanEditor } from "@/components/SpanEditor";
import type {
  AnnotationAnswer,
  AnnotationSchema,
  SchemaField,
  SpanAnswer,
} from "@/domain/schema";

function withoutKey(
  answer: AnnotationAnswer,
  key: string,
): AnnotationAnswer {
  const next = { ...answer };
  delete next[key];
  return next;
}

export function AnswerFields({
  schema,
  record,
  answer,
  onChange,
  disabled = false,
  fieldErrors = {},
}: {
  schema: AnnotationSchema;
  record: Record<string, unknown>;
  answer: AnnotationAnswer;
  onChange: (answer: AnnotationAnswer) => void;
  disabled?: boolean;
  fieldErrors?: Record<string, string>;
}) {
  function setValue(key: string, value: AnnotationAnswer[string] | undefined) {
    if (value === undefined) {
      onChange(withoutKey(answer, key));
      return;
    }
    onChange({ ...answer, [key]: value });
  }

  return (
    <div className="stack" style={{ gap: "1.1rem" }}>
      {schema.instructions ? (
        <p className="small muted">{schema.instructions}</p>
      ) : null}
      {schema.fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          record={record}
          value={answer[field.key]}
          onChange={(value) => setValue(field.key, value)}
          disabled={disabled}
          error={fieldErrors[field.key]}
        />
      ))}
    </div>
  );
}

function FieldControl({
  field,
  record,
  value,
  onChange,
  disabled,
  error,
}: {
  field: SchemaField;
  record: Record<string, unknown>;
  value: AnnotationAnswer[string] | undefined;
  onChange: (value: AnnotationAnswer[string] | undefined) => void;
  disabled: boolean;
  error?: string;
}) {
  const describedBy = [
    field.help ? `${field.key}-help` : null,
    error ? `${field.key}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <fieldset className="schema-question" aria-describedby={describedBy || undefined}>
      <legend>
        {field.label}
        {field.required ? (
          <>
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : (
          <span className="tiny muted"> (optional)</span>
        )}
      </legend>
      {field.help ? (
        <p className="field-hint" id={`${field.key}-help`}>
          {field.help}
        </p>
      ) : null}

      {field.type === "single_select" ? (
        <div className="schema-options">
          {field.options.map((option) => (
            <label className="choice-card" key={option.value}>
              <input
                type="radio"
                name={field.key}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                aria-describedby={describedBy || undefined}
              />
              <span>
                <strong>{option.label}</strong>
                <span className="option-value" aria-hidden="true">
                  {option.value}
                </span>
              </span>
            </label>
          ))}
          {!field.required && value !== undefined ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(undefined)}
              disabled={disabled}
            >
              Clear answer
            </button>
          ) : null}
        </div>
      ) : null}

      {field.type === "multi_select" ? (
        <div className="schema-options">
          {field.options.map((option) => {
            const currentValues = Array.isArray(value) ? (value as string[]) : [];
            const selected = currentValues.includes(option.value);
            return (
              <label className="choice-card" key={option.value}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    onChange(
                      selected
                        ? currentValues.filter((item) => item !== option.value)
                        : [...currentValues, option.value],
                    );
                  }}
                  disabled={disabled}
                />
                <span>
                  <strong>{option.label}</strong>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {field.type === "text" ? (
        <div className="field">
          <label className="sr-only" htmlFor={`${field.key}-text`}>
            {field.label}
          </label>
          <textarea
            className="textarea"
            id={`${field.key}-text`}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value || undefined)}
            disabled={disabled}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
          />
          <p className="field-hint">
            {typeof value === "string" ? value.length.toLocaleString() : 0} of{" "}
            {field.maxLength.toLocaleString()} characters
          </p>
        </div>
      ) : null}

      {field.type === "number" ? (
        <div className="field" style={{ maxWidth: "16rem" }}>
          <label className="sr-only" htmlFor={`${field.key}-number`}>
            {field.label}
          </label>
          <input
            className="input"
            id={`${field.key}-number`}
            type="number"
            value={typeof value === "number" ? value : ""}
            min={field.min}
            max={field.max}
            step="any"
            onChange={(event) => {
              if (event.target.value === "") {
                onChange(undefined);
                return;
              }
              const parsed = Number(event.target.value);
              onChange(Number.isFinite(parsed) ? parsed : undefined);
            }}
            disabled={disabled}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
          />
        </div>
      ) : null}

      {field.type === "boolean" ? (
        <div className="schema-options">
          <label className="choice-card">
            <input
              type="radio"
              name={field.key}
              checked={value === true}
              onChange={() => onChange(true)}
              disabled={disabled}
            />
            <span>
              <strong>Yes</strong>
            </span>
          </label>
          <label className="choice-card">
            <input
              type="radio"
              name={field.key}
              checked={value === false}
              onChange={() => onChange(false)}
              disabled={disabled}
            />
            <span>
              <strong>No</strong>
            </span>
          </label>
          {!field.required && value !== undefined ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(undefined)}
              disabled={disabled}
            >
              Clear answer
            </button>
          ) : null}
        </div>
      ) : null}

      {field.type === "span" ? (
        <SpanEditor
          field={field}
          sourceText={
            typeof record[field.sourceField] === "string"
              ? (record[field.sourceField] as string)
              : null
          }
          spans={Array.isArray(value) ? (value as SpanAnswer[]) : []}
          onChange={(spans) => onChange(spans.length > 0 ? spans : undefined)}
          disabled={disabled}
          describedBy={describedBy || undefined}
        />
      ) : null}

      {error ? (
        <p className="field-error" id={`${field.key}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
