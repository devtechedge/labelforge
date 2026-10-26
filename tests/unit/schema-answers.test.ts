import { describe, expect, it } from "vitest";

import { validateAnswer } from "@/domain/answers";
import {
  parseAnnotationSchema,
  type AnnotationSchema,
} from "@/domain/schema";

const rawSchema = {
  kind: "labelforge.annotation-schema",
  version: 1,
  title: "Test schema",
  fields: [
    {
      key: "category",
      label: "Category",
      type: "single_select",
      required: true,
      options: [
        { value: "bug", label: "Bug" },
        { value: "praise", label: "Praise" },
      ],
    },
    {
      key: "labels",
      label: "Labels",
      type: "multi_select",
      required: false,
      options: [
        { value: "urgent", label: "Urgent" },
        { value: "billing", label: "Billing" },
      ],
    },
    {
      key: "note",
      label: "Note",
      type: "text",
      required: false,
      maxLength: 20,
    },
    {
      key: "minutes",
      label: "Minutes",
      type: "number",
      required: false,
      min: 0,
      max: 100,
    },
    {
      key: "resolved",
      label: "Resolved",
      type: "boolean",
      required: false,
    },
    {
      key: "quotes",
      label: "Quotes",
      type: "span",
      required: false,
      sourceField: "text",
      maxSpans: 2,
      labels: [
        { value: "unclear", label: "Unclear" },
        { value: "promise", label: "Promise" },
      ],
    },
  ],
};

const schemaResult = parseAnnotationSchema(rawSchema);
if (!schemaResult.ok) throw new Error("Fixture schema is invalid.");
const schema: AnnotationSchema = schemaResult.schema;
const record = { text: "Seat count is wrong and we promise a fix." };

describe("schema parsing", () => {
  it("accepts a valid schema and fills text defaults", () => {
    expect(schema.fields).toHaveLength(6);
    const text = schema.fields.find((field) => field.key === "note");
    expect(text?.type).toBe("text");
    if (text?.type === "text") expect(text.maxLength).toBe(20);
  });

  it("rejects duplicate keys and options", () => {
    const duplicateKey = parseAnnotationSchema({
      ...rawSchema,
      fields: [rawSchema.fields[0], rawSchema.fields[0]],
    });
    expect(duplicateKey.ok).toBe(false);

    const duplicateOption = parseAnnotationSchema({
      ...rawSchema,
      fields: [
        {
          ...rawSchema.fields[0],
          options: [
            { value: "bug", label: "Bug" },
            { value: "bug", label: "Duplicate" },
          ],
        },
      ],
    });
    expect(duplicateOption.ok).toBe(false);
  });

  it("rejects a numeric range with min above max", () => {
    const result = parseAnnotationSchema({
      ...rawSchema,
      fields: [{ ...rawSchema.fields[3], min: 10, max: 1 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("answer validation", () => {
  it("accepts a complete valid answer", () => {
    const validation = validateAnswer(
      schema,
      {
        category: "bug",
        labels: ["urgent", "billing"],
        note: "Short note",
        minutes: 10,
        resolved: false,
        quotes: [
          { start: 0, end: 10, label: "unclear", quote: "Seat count" },
        ],
      },
      record,
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.missingRequired).toHaveLength(0);
    expect(validation.answer.category).toBe("bug");
  });

  it("reports required, option, range, length, and type failures", () => {
    const missing = validateAnswer(schema, {}, record);
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.missingRequired[0]?.field).toBe("category");

    const invalid = validateAnswer(
      schema,
      {
        category: "unknown",
        labels: ["urgent", "urgent"],
        note: "x".repeat(21),
        minutes: 101,
        resolved: "yes",
      },
      record,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues.map((issue) => issue.field)).toEqual(
        expect.arrayContaining(["category", "labels", "note", "minutes", "resolved"]),
      );
    }
  });

  it("validates span offsets, quotes, overlap, and source type", () => {
    const valid = validateAnswer(
      schema,
      {
        category: "bug",
        quotes: [
          { start: 0, end: 10, label: "unclear", quote: "Seat count" },
        ],
      },
      record,
    );
    expect(valid.ok).toBe(true);

    const badQuote = validateAnswer(
      schema,
      {
        category: "bug",
        quotes: [{ start: 0, end: 10, label: "unclear", quote: "Wrong" }],
      },
      record,
    );
    expect(badQuote.ok).toBe(false);

    const overlap = validateAnswer(
      schema,
      {
        category: "bug",
        quotes: [
          { start: 0, end: 10, label: "unclear", quote: "Seat count" },
          { start: 5, end: 15, label: "promise", quote: "count is wr" },
        ],
      },
      record,
    );
    expect(overlap.ok).toBe(false);

    const noSource = validateAnswer(
      schema,
      {
        category: "bug",
        quotes: [{ start: 0, end: 1, label: "unclear", quote: "x" }],
      },
      { text: 42 },
    );
    expect(noSource.ok).toBe(false);
  });

  it("treats whitespace-only required answers as missing", () => {
    const validation = validateAnswer(schema, { category: "  " }, record);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.missingRequired).toHaveLength(1);
  });
});
