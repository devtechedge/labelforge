import { LIMITS } from "@/domain/limits";
import type { JsonValue } from "@/domain/canonical";

import type { RowIssue } from "./csv";

export type JsonlRecord = {
  rowNumber: number;
  data: Record<string, JsonValue> | null;
  issue?: RowIssue;
};

export type JsonlParseResult =
  | {
      ok: true;
      records: JsonlRecord[];
      notes: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export function nestingDepth(value: JsonValue): number {
  if (Array.isArray(value)) {
    return 1 + Math.max(0, ...value.map((item) => nestingDepth(item)));
  }
  if (value && typeof value === "object") {
    return (
      1 +
      Math.max(
        0,
        ...Object.values(value).map((item) => nestingDepth(item as JsonValue)),
      )
    );
  }
  return 0;
}

export function inspectJsonRecord(value: unknown): {
  ok: boolean;
  data?: Record<string, JsonValue>;
  issues?: RowIssue[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ rowNumber: 0, code: "NOT_AN_OBJECT", message: "Each line must be a JSON object." }],
    };
  }

  const data = value as Record<string, JsonValue>;
  const keys = Object.keys(data);
  const issues: RowIssue[] = [];

  if (keys.length === 0) {
    issues.push({ rowNumber: 0, code: "BLANK_RECORD", message: "The object has no fields." });
  }
  if (keys.length > LIMITS.fieldsPerRecord) {
    issues.push({
      rowNumber: 0,
      code: "TOO_MANY_FIELDS",
      message: `The object has ${keys.length} fields. The limit is ${LIMITS.fieldsPerRecord}.`,
    });
  }
  if (nestingDepth(data) > LIMITS.nestingDepth) {
    issues.push({
      rowNumber: 0,
      code: "NESTING_TOO_DEEP",
      message: `Nested values can be at most ${LIMITS.nestingDepth} levels deep.`,
    });
  }
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > LIMITS.recordBytes) {
    issues.push({
      rowNumber: 0,
      code: "RECORD_TOO_LARGE",
      message: `The record exceeds the ${Math.round(LIMITS.recordBytes / 1024)} KB limit.`,
    });
  }

  for (const [key, item] of Object.entries(data)) {
    if (key.length > 80 || /[\u0000-\u001f\u007f]/.test(key)) {
      issues.push({
        rowNumber: 0,
        code: "INVALID_FIELD_NAME",
        message: "A field name is blank, too long, or contains control characters.",
      });
    }
    if (typeof item === "string" && item.length > LIMITS.fieldLength) {
      issues.push({
        rowNumber: 0,
        field: key,
        code: "FIELD_TOO_LONG",
        message: `Field "${key}" is longer than ${LIMITS.fieldLength.toLocaleString()} characters.`,
      });
    }
  }

  return { ok: issues.length === 0, data, issues };
}

export function parseJsonl(input: string): JsonlParseResult {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const records: JsonlRecord[] = [];
  const notes: string[] = [];
  let blankLines = 0;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim() === "") {
      blankLines += 1;
      continue;
    }
    if (Buffer.byteLength(line, "utf8") > LIMITS.recordBytes) {
      records.push({
        rowNumber: lineNumber,
        data: null,
        issue: {
          rowNumber: lineNumber,
          code: "RECORD_TOO_LARGE",
          message: `Line ${lineNumber} exceeds the ${Math.round(LIMITS.recordBytes / 1024)} KB line limit.`,
        },
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      records.push({
        rowNumber: lineNumber,
        data: null,
        issue: {
          rowNumber: lineNumber,
          code: "INVALID_JSON",
          message: `Line ${lineNumber} is not valid JSON.`,
        },
      });
      continue;
    }

    const inspection = inspectJsonRecord(parsed);
    if (!inspection.ok || !inspection.data) {
      const first = inspection.issues?.[0];
      records.push({
        rowNumber: lineNumber,
        data: null,
        issue: {
          rowNumber: lineNumber,
          field: first?.field,
          code: first?.code ?? "INVALID_RECORD",
          message: first?.message ?? "The record is invalid.",
        },
      });
      continue;
    }

    records.push({ rowNumber: lineNumber, data: inspection.data });
  }

  if (records.length > LIMITS.recordsPerImport) {
    return {
      ok: false,
      code: "TOO_MANY_ROWS",
      message: `The file has ${records.length.toLocaleString()} records. The limit is ${LIMITS.recordsPerImport.toLocaleString()}.`,
    };
  }
  if (records.length === 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The file contains no JSONL records." };
  }
  if (blankLines > 0) {
    notes.push(`${blankLines} blank ${blankLines === 1 ? "line was" : "lines were"} skipped.`);
  }

  return { ok: true, records, notes };
}
