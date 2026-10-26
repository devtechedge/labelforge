import { describe, expect, it } from "vitest";

import { parseCsv } from "@/importers/csv";
import { inspectJsonRecord, parseJsonl } from "@/importers/jsonl";
import { prepareImport } from "@/importers";

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function prepare(text: string, fileName = "records.csv") {
  return prepareImport({ bytes: bytes(text), fileName });
}

describe("CSV parser", () => {
  it("handles quoted commas, escaped quotes, multiline cells, CRLF, and BOM", () => {
    const text =
      '\uFEFFid,text\r\n1,"Hello, ""world"""\r\n2,"Line one\r\nLine two"\r\n';
    const result = parseCsv(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headers).toEqual(["id", "text"]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.values?.text).toBe('Hello, "world"');
    expect(result.records[1]?.values?.text).toBe("Line one\nLine two");
    expect(result.notes.join(" ")).toContain("byte order mark");
  });

  it("rejects duplicate and malformed headers", () => {
    const duplicate = parseCsv("id,id\n1,2\n");
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("DUPLICATE_HEADER");

    const blank = parseCsv(",name\n1,Ana\n");
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.code).toBe("INVALID_HEADER");
  });

  it("quarantines blank rows and column mismatches", () => {
    const result = parseCsv("id,text\n1,ok\n,,\n2,only-one,extra\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records[1]?.issue?.code).toBe("BLANK_RECORD");
    expect(result.records[2]?.issue?.code).toBe("COLUMN_COUNT");
  });

  it("rejects an unclosed quoted field", () => {
    const result = parseCsv('id,text\n1,"unfinished\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CSV");
  });

  it("enforces field length", () => {
    const long = "x".repeat(8_001);
    const result = parseCsv(`id,text\n1,${long}\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records[0]?.issue?.code).toBe("FIELD_TOO_LONG");
  });
});

describe("import preparation", () => {
  it("uses explicit and detected source identity and quarantines duplicates", () => {
    const result = prepare(
      "review_id,text\nR-1,one\nR-2,two\nR-1,duplicate\n",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.validRows).toBe(2);
    expect(result.result.invalidRows).toBe(1);
    expect(result.result.duplicateRows).toBe(1);
    expect(result.result.rows[2]?.errorCode).toBe("DUPLICATE_ID");
    expect(result.result.notes.join(" ")).toContain("review_id");
  });

  it("uses positional identifiers and records the normalization", () => {
    const result = prepare("name,text\nAna,one\nBen,two\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.rows[0]?.sourceId).toBe("row-1");
    expect(result.result.notes.join(" ")).toContain("positional identifier");
  });

  it("rejects invalid UTF-8 and oversized uploads", () => {
    const invalid = prepareImport({
      bytes: new Uint8Array([0xff, 0xfe, 0xfd]),
      fileName: "bad.csv",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("NOT_UTF8");

    const huge = new Uint8Array(4 * 1024 * 1024 + 1);
    const tooLarge = prepareImport({ bytes: huge, fileName: "huge.csv" });
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects files with an unsupported extension", () => {
    const result = prepareImport({
      bytes: bytes("hello"),
      fileName: "notes.txt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSUPPORTED_FORMAT");
  });
});

describe("JSONL parser", () => {
  it("reports malformed lines, blank lines, duplicates, and positional ids", () => {
    const result = prepareImport({
      bytes: bytes(
        [
          '{"case_id":"C-1","value":1}',
          "",
          "this is not json",
          '{"case_id":"C-1","value":2}',
          '{"value":3}',
          "[1,2,3]",
        ].join("\n"),
      ),
      fileName: "records.jsonl",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.format).toBe("JSONL");
    expect(result.result.invalidRows).toBe(3);
    expect(result.result.duplicateRows).toBe(1);
    expect(result.result.validRows).toBe(2);
    expect(result.result.notes.join(" ")).toContain("blank line");
  });

  it("enforces nesting depth and object shape", () => {
    const deep = {
      case_id: "x",
      nested: { a: { b: { c: { d: { e: { f: 1 } } } } } },
    };
    const result = inspectJsonRecord(deep);
    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.code).toBe("NESTING_TOO_DEEP");

    const array = inspectJsonRecord([1, 2]);
    expect(array.ok).toBe(false);
    expect(array.issues?.[0]?.code).toBe("NOT_AN_OBJECT");
  });

  it("requires an explicit identity field when configured", () => {
    const result = prepareImport({
      bytes: bytes('{"label":"a"}\n{"label":"b"}\n'),
      fileName: "records.jsonl",
      options: { idField: "record_id" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.validRows).toBe(0);
    expect(result.result.rows[0]?.errorCode).toBe("MISSING_SOURCE_ID");
  });

  it("parses a valid JSONL line with scalar fields", () => {
    const result = parseJsonl('{"id":"1","text":"one"}\n\n{"id":"2","text":"two"}\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(2);
    expect(result.records[1]?.data?.text).toBe("two");
  });
});
