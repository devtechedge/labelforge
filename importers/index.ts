import { LIMITS } from "@/domain/limits";
import { sha256Hex, type JsonValue } from "@/domain/canonical";

import { parseCsv, type RowIssue } from "./csv";
import { parseJsonl } from "./jsonl";

export type ImportFormat = "CSV" | "JSONL";

export type ImportOptions = {
  delimiter?: "," | ";" | "\t";
  idField?: string;
};

export type PreparedRow = {
  rowNumber: number;
  sourceId: string | null;
  data: Record<string, JsonValue> | null;
  valid: boolean;
  errorCode?: string;
  errorField?: string;
  errorMessage?: string;
};

export type PreparedImport = {
  format: ImportFormat;
  fileName: string;
  byteSize: number;
  sourceChecksum: string;
  headers: string[];
  rows: PreparedRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  notes: string[];
};

export type ImportFailure = {
  ok: false;
  code: string;
  message: string;
};

export type ImportSuccess = {
  ok: true;
  result: PreparedImport;
};

const AUTO_ID_FIELDS = ["id", "record_id", "uid", "key", "review_id", "case_id"];

export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 120);
  return cleaned || "upload";
}

export function detectFormat(fileName: string): ImportFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "JSONL";
  return null;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
  } catch {
    return null;
  }
}

function sourceIdFromRecord(
  data: Record<string, JsonValue>,
  options: ImportOptions,
): { id: string | null; source: "explicit" | "auto" | "positional" | "missing" } {
  if (options.idField) {
    const value = data[options.idField];
    if (value === undefined || value === null) {
      return { id: null, source: "missing" };
    }
    if (typeof value !== "string" && typeof value !== "number") {
      return { id: null, source: "missing" };
    }
    const id = String(value).trim();
    return id ? { id, source: "explicit" } : { id: null, source: "missing" };
  }

  for (const key of AUTO_ID_FIELDS) {
    const value = data[key];
    if (typeof value === "string" || typeof value === "number") {
      const id = String(value).trim();
      if (id) return { id, source: "auto" };
    }
  }
  return { id: null, source: "positional" };
}

function issueToPrepared(
  rowNumber: number,
  issue: RowIssue | undefined,
): PreparedRow {
  return {
    rowNumber,
    sourceId: null,
    data: null,
    valid: false,
    errorCode: issue?.code ?? "INVALID_RECORD",
    errorField: issue?.field,
    errorMessage: issue?.message ?? "The row is invalid.",
  };
}

function finalizeRows(
  rows: Array<{ rowNumber: number; data: Record<string, JsonValue> | null; issue?: RowIssue }>,
  options: ImportOptions,
  parserNotes: string[],
): Omit<
  PreparedImport,
  "format" | "fileName" | "byteSize" | "sourceChecksum" | "headers"
> {
  const notes = [...parserNotes];
  const seenIds = new Map<string, number>();
  const prepared: PreparedRow[] = [];

  const autoField = options.idField
    ? options.idField
    : AUTO_ID_FIELDS.find((key) =>
        rows.some((row) => row.data && key in row.data),
      );

  let positionalCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    if (!row.data || row.issue) {
      prepared.push(issueToPrepared(row.rowNumber, row.issue));
      continue;
    }

    const idResult = sourceIdFromRecord(row.data, options);
    let sourceId = idResult.id;
    if (idResult.source === "missing") {
      prepared.push({
        rowNumber: row.rowNumber,
        sourceId: null,
        data: null,
        valid: false,
        errorCode: "MISSING_SOURCE_ID",
        errorField: options.idField,
        errorMessage: options.idField
          ? `The selected identity field "${options.idField}" is missing or blank.`
          : "No usable source identifier was found.",
      });
      continue;
    }
    if (idResult.source === "positional") {
      sourceId = `row-${row.rowNumber}`;
      positionalCount += 1;
    }
    if (!sourceId || sourceId.length > 200) {
      prepared.push({
        rowNumber: row.rowNumber,
        sourceId: null,
        data: null,
        valid: false,
        errorCode: "SOURCE_ID_TOO_LONG",
        errorMessage: "The source identifier must be 200 characters or fewer.",
      });
      continue;
    }

    const duplicateOf = seenIds.get(sourceId);
    if (duplicateOf !== undefined) {
      duplicateCount += 1;
      prepared.push({
        rowNumber: row.rowNumber,
        sourceId,
        data: null,
        valid: false,
        errorCode: "DUPLICATE_ID",
        errorMessage: `This identifier already appeared on row ${duplicateOf}.`,
      });
      continue;
    }
    seenIds.set(sourceId, row.rowNumber);
    prepared.push({
      rowNumber: row.rowNumber,
      sourceId,
      data: row.data,
      valid: true,
    });
  }

  if (autoField) {
    notes.push(`Source identity read from "${autoField}" when present.`);
  }
  if (positionalCount > 0) {
    notes.push(
      `${positionalCount} ${
        positionalCount === 1 ? "row uses" : "rows use"
      } a positional identifier (row-N) because no identity field was found.`,
    );
  }
  if (duplicateCount > 0) {
    notes.push(
      `${duplicateCount} duplicate ${
        duplicateCount === 1 ? "identifier was" : "identifiers were"
      } quarantined.`,
    );
  }

  const validRows = prepared.filter((row) => row.valid).length;
  return {
    rows: prepared,
    totalRows: prepared.length,
    validRows,
    invalidRows: prepared.length - validRows,
    duplicateRows: duplicateCount,
    notes,
  };
}

export function prepareImport(input: {
  bytes: Uint8Array;
  fileName: string;
  format?: ImportFormat;
  options?: ImportOptions;
}): ImportSuccess | ImportFailure {
  const fileName = sanitizeFileName(input.fileName);
  const format = input.format ?? detectFormat(fileName);
  if (!format) {
    return {
      ok: false,
      code: "UNSUPPORTED_FORMAT",
      message: "Upload a .csv, .jsonl, or .ndjson file.",
    };
  }
  if (input.bytes.byteLength === 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The uploaded file is empty." };
  }
  if (input.bytes.byteLength > LIMITS.fileBytes) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `The file is larger than the ${
        LIMITS.fileBytes / (1024 * 1024)
      } MB upload limit.`,
    };
  }

  const text = decodeUtf8(input.bytes);
  if (text === null) {
    return {
      ok: false,
      code: "NOT_UTF8",
      message: "The file is not valid UTF-8. Re-encode it as UTF-8 and try again.",
    };
  }

  const options = input.options ?? {};
  const sourceChecksum = sha256Hex(input.bytes);

  if (format === "CSV") {
    const parsed = parseCsv(text, options.delimiter ?? ",");
    if (!parsed.ok) {
      return { ok: false, code: parsed.code, message: parsed.message };
    }
    const finalized = finalizeRows(
      parsed.records.map((record) => ({
        rowNumber: record.rowNumber,
        data: record.values,
        issue: record.issue,
      })),
      options,
      parsed.notes,
    );
    return {
      ok: true,
      result: {
        format,
        fileName,
        byteSize: input.bytes.byteLength,
        sourceChecksum,
        headers: parsed.headers,
        ...finalized,
      },
    };
  }

  const parsed = parseJsonl(text);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, message: parsed.message };
  }
  const finalized = finalizeRows(
    parsed.records.map((record) => ({
      rowNumber: record.rowNumber,
      data: record.data,
      issue: record.issue,
    })),
    options,
    parsed.notes,
  );
  const headerSet = new Set<string>();
  for (const row of parsed.records) {
    if (row.data) {
      for (const key of Object.keys(row.data)) headerSet.add(key);
    }
  }
  return {
    ok: true,
    result: {
      format,
      fileName,
      byteSize: input.bytes.byteLength,
      sourceChecksum,
      headers: [...headerSet].slice(0, LIMITS.fieldsPerRecord),
      ...finalized,
    },
  };
}
