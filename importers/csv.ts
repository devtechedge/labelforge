import { LIMITS } from "@/domain/limits";

export type RowIssue = {
  rowNumber: number;
  field?: string;
  code: string;
  message: string;
};

export type CsvRecord = {
  rowNumber: number;
  values: Record<string, string> | null;
  issue?: RowIssue;
};

export type CsvParseResult =
  | {
      ok: true;
      headers: string[];
      records: CsvRecord[];
      notes: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      rowNumber?: number;
    };

const DELIMITERS = new Set([",", ";", "\t"]);
const MAX_FIELD_BYTES = LIMITS.fieldLength;
const MAX_ROW_BYTES = LIMITS.recordBytes;

function countBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function validateHeader(header: string): string | null {
  if (header.trim() === "") return "Header names cannot be blank.";
  if (header.length > 80) return "Header names must be 80 characters or fewer.";
  if (/[\u0000-\u001f\u007f]/.test(header)) {
    return "Header names cannot contain control characters.";
  }
  if (["__proto__", "constructor", "prototype"].includes(header)) {
    return `Header name "${header}" is reserved.`;
  }
  return null;
}

export function parseCsv(input: string, delimiter = ","): CsvParseResult {
  if (!DELIMITERS.has(delimiter)) {
    return { ok: false, code: "INVALID_OPTIONS", message: "Choose a supported delimiter." };
  }

  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const notes: string[] = [];
  if (text !== input) notes.push("UTF-8 byte order mark removed.");

  const rows: string[][] = [];
  const rowIssues: Array<RowIssue | undefined> = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowHasContent = false;
  let rowIssue: RowIssue | undefined;
  let rowBytes = 0;
  let rowNumber = 1;
  let unclosedQuote = false;

  const pushField = () => {
    fields.push(field);
    field = "";
    rowBytes = 0;
  };

  const pushRow = () => {
    if (!rowHasContent && fields.length === 0 && field === "") {
      fields = [];
      rowIssue = undefined;
      return;
    }
    pushField();
    rows.push(fields);
    rowIssues.push(rowIssue);
    fields = [];
    rowHasContent = false;
    rowIssue = undefined;
    rowNumber += 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          rowBytes += 1;
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\r" && text[index + 1] === "\n") {
          field += "\n";
          rowBytes += 1;
          index += 1;
        } else {
          field += char;
          rowBytes += char === "\n" ? 1 : countBytes(char);
        }
      }
    } else if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
        rowHasContent = true;
      } else {
        rowIssue = {
          rowNumber,
          code: "INVALID_CSV",
          message: "A quote appears inside an unquoted field.",
        };
        field += char;
      }
    } else if (char === delimiter) {
      pushField();
      rowHasContent = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      field += char;
      rowBytes += countBytes(char);
      if (char.trim() !== "") rowHasContent = true;
    }

    if (rowBytes > MAX_ROW_BYTES) {
      return {
        ok: false,
        code: "RECORD_TOO_LARGE",
        message: `Row ${rowNumber} exceeds the ${Math.round(
          MAX_ROW_BYTES / 1024,
        )} KB row limit.`,
      };
    }
    if (field.length > MAX_FIELD_BYTES) {
      rowIssue = {
        rowNumber,
        code: "FIELD_TOO_LONG",
        message: `Row ${rowNumber} contains a field longer than ${MAX_FIELD_BYTES.toLocaleString()} characters.`,
      };
    }
  }

  if (inQuotes) unclosedQuote = true;
  if (unclosedQuote) {
    return {
      ok: false,
      code: "INVALID_CSV",
      message: "The file ends inside a quoted field. Check for a missing closing quote.",
      rowNumber,
    };
  }

  if (field !== "" || fields.length > 0 || rowHasContent) {
    pushRow();
  }

  if (rows.length === 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The file contains no CSV rows." };
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return { ok: false, code: "EMPTY_FILE", message: "The file contains no CSV rows." };
  }
  const headers = headerRow.map((header) => header.trim());
  if (headers.length > LIMITS.fieldsPerRecord) {
    return {
      ok: false,
      code: "TOO_MANY_FIELDS",
      message: `The file has ${headers.length} columns. The limit is ${LIMITS.fieldsPerRecord}.`,
    };
  }

  const seenHeaders = new Set<string>();
  for (const [index, header] of headers.entries()) {
    const problem = validateHeader(header);
    if (problem) {
      return {
        ok: false,
        code: "INVALID_HEADER",
        message: `Column ${index + 1}: ${problem}`,
      };
    }
    if (seenHeaders.has(header)) {
      return {
        ok: false,
        code: "DUPLICATE_HEADER",
        message: `The column "${header}" appears more than once.`,
      };
    }
    seenHeaders.add(header);
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > LIMITS.recordsPerImport) {
    return {
      ok: false,
      code: "TOO_MANY_ROWS",
      message: `The file has ${dataRows.length.toLocaleString()} rows. The limit is ${LIMITS.recordsPerImport.toLocaleString()}.`,
    };
  }

  const records: CsvRecord[] = dataRows.map((cells, index) => {
    const issue = rowIssues[index + 1];
    const recordNumber = index + 1;

    if (cells.length !== headers.length) {
      return {
        rowNumber: recordNumber,
        values: null,
        issue: {
          rowNumber: recordNumber,
          code: "COLUMN_COUNT",
          message: `Expected ${headers.length} columns, found ${cells.length}.`,
        },
      };
    }
    if (cells.every((cell) => cell.trim() === "")) {
      return {
        rowNumber: recordNumber,
        values: null,
        issue: {
          rowNumber: recordNumber,
          code: "BLANK_RECORD",
          message: "The row has no values.",
        },
      };
    }

    const values: Record<string, string> = {};
    for (const [columnIndex, header] of headers.entries()) {
      const value = cells[columnIndex] ?? "";
      if (value.length > MAX_FIELD_BYTES) {
        return {
          rowNumber: recordNumber,
          values: null,
          issue: {
            rowNumber: recordNumber,
            field: header,
            code: "FIELD_TOO_LONG",
            message: `Column "${header}" is longer than ${MAX_FIELD_BYTES.toLocaleString()} characters.`,
          },
        };
      }
      values[header] = value;
    }

    if (issue) {
      return { rowNumber: recordNumber, values: null, issue };
    }

    return { rowNumber: recordNumber, values };
  });

  return { ok: true, headers, records, notes };
}
