import type {
  AnnotationAnswer,
  AnnotationSchema,
  SchemaField,
} from "@/domain/schema";

export type DisplayAnswer = {
  fieldKey: string;
  label: string;
  text: string;
  missing: boolean;
};

function optionLabel(field: SchemaField, value: string): string {
  if (field.type === "single_select" || field.type === "multi_select") {
    return field.options.find((option) => option.value === value)?.label ?? value;
  }
  return value;
}

export function describeAnswer(
  schema: AnnotationSchema,
  answer: AnnotationAnswer | null | undefined,
): DisplayAnswer[] {
  const value = answer ?? {};
  return schema.fields.map((field) => {
    const raw = value[field.key];
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
      return { fieldKey: field.key, label: field.label, text: "No answer", missing: true };
    }
    switch (field.type) {
      case "single_select":
        return {
          fieldKey: field.key,
          label: field.label,
          text: typeof raw === "string" ? optionLabel(field, raw) : "No answer",
          missing: false,
        };
      case "multi_select": {
        const values = Array.isArray(raw) ? raw : [];
        return {
          fieldKey: field.key,
          label: field.label,
          text:
            values.length > 0
              ? values
                  .filter((item): item is string => typeof item === "string")
                  .map((item) => optionLabel(field, item))
                  .join(", ")
              : "No answer",
          missing: false,
        };
      }
      case "text":
        return { fieldKey: field.key, label: field.label, text: String(raw), missing: false };
      case "number":
        return { fieldKey: field.key, label: field.label, text: String(raw), missing: false };
      case "boolean":
        return {
          fieldKey: field.key,
          label: field.label,
          text: raw === true ? "Yes" : "No",
          missing: false,
        };
      case "span": {
        const spans = Array.isArray(raw) ? raw : [];
        const text = spans
          .map((span) => {
            if (!span || typeof span !== "object") return null;
            const item = span as { label?: unknown; quote?: unknown };
            const label =
              field.labels.find((option) => option.value === item.label)?.label ??
              String(item.label ?? "span");
            return `${label}: "${String(item.quote ?? "")}"`;
          })
          .filter(Boolean)
          .join("; ");
        return { fieldKey: field.key, label: field.label, text: text || "No answer", missing: false };
      }
    }
  });
}

export function differingFieldKeys(
  schema: AnnotationSchema,
  answers: AnnotationAnswer[],
): string[] {
  if (answers.length < 2) return [];
  return schema.fields
    .filter((field) => {
      const values = answers.map((answer) => JSON.stringify(answer[field.key] ?? null));
      return new Set(values).size > 1;
    })
    .map((field) => field.key);
}
