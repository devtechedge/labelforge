import { z } from "zod";

import { LIMITS } from "@/domain/limits";

const fieldKey = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{0,39}$/,
    "Field keys use lowercase letters, numbers, and underscores.",
  );

const optionValue = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]{0,39}$/,
    "Option values use lowercase letters, numbers, hyphens, and underscores.",
  );

const option = z.object({
  value: optionValue,
  label: z.string().trim().min(1).max(120),
});

const baseField = {
  key: fieldKey,
  label: z.string().trim().min(1).max(120),
  help: z.string().trim().max(300).optional(),
  required: z.boolean(),
};

const singleSelectField = z.object({
  ...baseField,
  type: z.literal("single_select"),
  options: z.array(option).min(2).max(LIMITS.schemaOptions),
});

const multiSelectField = z.object({
  ...baseField,
  type: z.literal("multi_select"),
  options: z.array(option).min(2).max(LIMITS.schemaOptions),
});

const textField = z.object({
  ...baseField,
  type: z.literal("text"),
  maxLength: z.number().int().min(1).max(LIMITS.fieldLength).default(2000),
});

const numberField = z.object({
  ...baseField,
  type: z.literal("number"),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});

const booleanField = z.object({
  ...baseField,
  type: z.literal("boolean"),
});

const spanField = z.object({
  ...baseField,
  type: z.literal("span"),
  sourceField: fieldKey,
  labels: z.array(option).min(1).max(20),
  maxSpans: z.number().int().min(1).max(20).default(10),
});

export const schemaFieldSchema = z.discriminatedUnion("type", [
  singleSelectField,
  multiSelectField,
  textField,
  numberField,
  booleanField,
  spanField,
]);

export const annotationSchemaSchema = z
  .object({
    kind: z.literal("labelforge.annotation-schema"),
    version: z.literal(1),
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().max(2000).optional(),
    fields: z.array(schemaFieldSchema).min(1).max(LIMITS.schemaFields),
  })
  .superRefine((schema, ctx) => {
    const keys = new Set<string>();
    for (const [index, field] of schema.fields.entries()) {
      if (keys.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: `Duplicate field key "${field.key}".`,
        });
      }
      keys.add(field.key);

      if ("options" in field) {
        const values = new Set<string>();
        for (const [optionIndex, item] of field.options.entries()) {
          if (values.has(item.value)) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", index, "options", optionIndex, "value"],
              message: `Duplicate option value "${item.value}".`,
            });
          }
          values.add(item.value);
        }
      }

      if (field.type === "span") {
        const values = new Set<string>();
        for (const [labelIndex, item] of field.labels.entries()) {
          if (values.has(item.value)) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", index, "labels", labelIndex, "value"],
              message: `Duplicate span label "${item.value}".`,
            });
          }
          values.add(item.value);
        }
      }

      if (field.type === "number" && field.min !== undefined && field.max !== undefined) {
        if (field.min > field.max) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", index, "min"],
            message: "Minimum cannot exceed maximum.",
          });
        }
      }
    }
  });

export type AnnotationSchema = z.infer<typeof annotationSchemaSchema>;
export type SchemaField = z.infer<typeof schemaFieldSchema>;
export type SchemaOption = z.infer<typeof option>;
export type FieldType = SchemaField["type"];

export type SpanAnswer = {
  start: number;
  end: number;
  label: string;
  quote: string;
};

export type AnswerValue = string | string[] | number | boolean | SpanAnswer[];
export type AnnotationAnswer = Record<string, AnswerValue>;

export function parseAnnotationSchema(input: unknown):
  | { ok: true; schema: AnnotationSchema }
  | { ok: false; issues: Array<{ path: string; message: string }> } {
  const result = annotationSchemaSchema.safeParse(input);
  if (result.success) return { ok: true, schema: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export function schemaTypeLabel(type: FieldType): string {
  switch (type) {
    case "single_select":
      return "Single choice";
    case "multi_select":
      return "Multiple choice";
    case "text":
      return "Text";
    case "number":
      return "Number";
    case "boolean":
      return "Yes or no";
    case "span":
      return "Text span";
  }
}

export function emptyAnswerValue(field: SchemaField): AnswerValue | undefined {
  switch (field.type) {
    case "multi_select":
    case "span":
      return [];
    default:
      return undefined;
  }
}
