import type {
  AnnotationAnswer,
  AnnotationSchema,
  SchemaField,
  SpanAnswer,
} from "@/domain/schema";

export type AnswerIssue = { field: string; message: string };

export type AnswerValidation =
  | { ok: true; answer: AnnotationAnswer; missingRequired: AnswerIssue[] }
  | { ok: false; answer: AnnotationAnswer; issues: AnswerIssue[] };

type RecordData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function validateSpanField(
  field: Extract<SchemaField, { type: "span" }>,
  value: unknown,
  record: RecordData,
  issues: AnswerIssue[],
): SpanAnswer[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ field: field.key, message: "Expected a list of text spans." });
    return undefined;
  }
  if (value.length > field.maxSpans) {
    issues.push({
      field: field.key,
      message: `Use at most ${field.maxSpans} spans.`,
    });
    return undefined;
  }

  const source = record[field.sourceField];
  if (typeof source !== "string") {
    issues.push({
      field: field.key,
      message: `Source field "${field.sourceField}" is not text in this record.`,
    });
    return undefined;
  }

  const labels = new Set(field.labels.map((label) => label.value));
  const spans: SpanAnswer[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      issues.push({ field: field.key, message: `Span ${index + 1} is malformed.` });
      return undefined;
    }
    const { start, end, label, quote } = item;
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isInteger(start) ||
      !Number.isInteger(end)
    ) {
      issues.push({
        field: field.key,
        message: `Span ${index + 1} has invalid offsets.`,
      });
      return undefined;
    }
    if (start < 0 || end > source.length || start >= end) {
      issues.push({
        field: field.key,
        message: `Span ${index + 1} falls outside the source text.`,
      });
      return undefined;
    }
    if (typeof label !== "string" || !labels.has(label)) {
      issues.push({
        field: field.key,
        message: `Span ${index + 1} uses an unknown label.`,
      });
      return undefined;
    }
    if (typeof quote !== "string" || quote !== source.slice(start, end)) {
      issues.push({
        field: field.key,
        message: `Span ${index + 1} no longer matches the source text.`,
      });
      return undefined;
    }
    spans.push({ start, end, label, quote });
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1];
    const current = spans[index];
    if (previous && current && current.start < previous.end) {
      issues.push({
        field: field.key,
        message: "Text spans cannot overlap.",
      });
      return undefined;
    }
  }

  return spans;
}

export function validateAnswer(
  schema: AnnotationSchema,
  input: unknown,
  record: RecordData,
): AnswerValidation {
  const issues: AnswerIssue[] = [];
  const missingRequired: AnswerIssue[] = [];
  const normalized: AnnotationAnswer = {};

  if (!isRecord(input)) {
    return {
      ok: false,
      answer: {},
      issues: [{ field: "_form", message: "Answers must be an object." }],
    };
  }

  for (const field of schema.fields) {
    const raw = input[field.key];

    if (isBlank(raw)) {
      if (field.required) {
        missingRequired.push({
          field: field.key,
          message: `${field.label} is required.`,
        });
      }
      continue;
    }

    switch (field.type) {
      case "single_select": {
        const allowed = new Set(field.options.map((option) => option.value));
        if (typeof raw !== "string" || !allowed.has(raw)) {
          issues.push({ field: field.key, message: "Choose one of the listed options." });
        } else {
          normalized[field.key] = raw;
        }
        break;
      }
      case "multi_select": {
        const allowed = new Set(field.options.map((option) => option.value));
        if (
          !Array.isArray(raw) ||
          raw.some((item) => typeof item !== "string" || !allowed.has(item)) ||
          new Set(raw).size !== raw.length
        ) {
          issues.push({
            field: field.key,
            message: "Choose unique values from the listed options.",
          });
        } else {
          normalized[field.key] = raw as string[];
        }
        break;
      }
      case "text": {
        if (typeof raw !== "string") {
          issues.push({ field: field.key, message: "Enter text." });
        } else if (raw.length > field.maxLength) {
          issues.push({
            field: field.key,
            message: `Keep this under ${field.maxLength.toLocaleString()} characters.`,
          });
        } else {
          normalized[field.key] = raw;
        }
        break;
      }
      case "number": {
        if (typeof raw !== "number" || !Number.isFinite(raw)) {
          issues.push({ field: field.key, message: "Enter a finite number." });
        } else if (field.min !== undefined && raw < field.min) {
          issues.push({ field: field.key, message: `Use a value of at least ${field.min}.` });
        } else if (field.max !== undefined && raw > field.max) {
          issues.push({ field: field.key, message: `Use a value no higher than ${field.max}.` });
        } else {
          normalized[field.key] = raw;
        }
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") {
          issues.push({ field: field.key, message: "Choose yes or no." });
        } else {
          normalized[field.key] = raw;
        }
        break;
      }
      case "span": {
        const spans = validateSpanField(field, raw, record, issues);
        if (spans) {
          if (spans.length === 0 && field.required) {
            missingRequired.push({
              field: field.key,
              message: `${field.label} needs at least one span.`,
            });
          } else {
            normalized[field.key] = spans;
          }
        }
        break;
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, answer: normalized, issues };
  }
  return { ok: true, answer: normalized, missingRequired };
}

export function summarizeIncomplete(
  validation: AnswerValidation,
): string | null {
  if (!validation.ok) {
    return "Some answers do not match the active schema.";
  }
  if (validation.missingRequired.length === 0) return null;
  return `Missing ${validation.missingRequired.length} required ${
    validation.missingRequired.length === 1 ? "answer" : "answers"
  }.`;
}
