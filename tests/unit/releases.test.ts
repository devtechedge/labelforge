import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";

import {
  buildManifest,
  buildReleaseSnapshot,
  renderCsv,
  renderJsonl,
  type SnapshotTaskInput,
} from "@/exports/snapshot";
import { buildReleaseBundle } from "@/exports/bundle";
import { canonicalJson, sha256Hex, type JsonValue } from "@/domain/canonical";
import { parseAnnotationSchema } from "@/domain/schema";

const schemaResult = parseAnnotationSchema({
  kind: "labelforge.annotation-schema",
  version: 1,
  title: "Release test",
  fields: [
    {
      key: "category",
      label: "Category",
      type: "single_select",
      required: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
  ],
});
if (!schemaResult.ok) throw new Error("Fixture schema invalid");

type AnnotationInput = SnapshotTaskInput["annotations"][number];

function annotation(
  id: string,
  status: string,
  answer: JsonValue,
  revision = 2,
): AnnotationInput {
  return { id, status, answer, revision };
}

function task(overrides: Partial<SnapshotTaskInput> = {}): SnapshotTaskInput {
  return {
    taskId: "task-1",
    status: "ACCEPTED",
    requiredAnnotations: 1,
    datasetRecordId: "record-1",
    sourceId: "source-1",
    sourceOrder: 1,
    data: { text: "hello" },
    schemaVersionId: "schema-1",
    annotations: [annotation("a-1", "ACCEPTED", { category: "a" })],
    adjudication: null,
    ...overrides,
  };
}

describe("release snapshots", () => {
  it("selects accepted agreement and adjudicated answers, and counts exclusions", () => {
    const snapshot = buildReleaseSnapshot([
      task(),
      task({
        taskId: "task-2",
        sourceId: "source-2",
        sourceOrder: 2,
        status: "RESOLVED",
        annotations: [
          annotation("a-2", "SUBMITTED", { category: "a" }),
          annotation("a-3", "DISPUTED", { category: "b" }),
        ],
        adjudication: {
          id: "adj-1",
          finalAnswer: { category: "b" },
          chosenAnnotationId: "a-3",
          rationale: "The evidence supports b.",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      }),
      task({
        taskId: "task-3",
        sourceId: "source-3",
        sourceOrder: 3,
        status: "SUBMITTED",
        annotations: [annotation("a-4", "SUBMITTED", { category: "a" })],
      }),
      task({
        taskId: "task-4",
        sourceId: "source-4",
        sourceOrder: 4,
        status: "RESOLVED",
        annotations: [annotation("a-5", "SUBMITTED", { category: "a" })],
      }),
    ]);

    expect(snapshot.recordCount).toBe(2);
    expect(snapshot.items.map((item) => item.sourceId)).toEqual([
      "source-1",
      "source-2",
    ]);
    expect(snapshot.exclusions.task_not_final).toBe(1);
    expect(snapshot.exclusions.resolved_without_adjudication).toBe(1);
    expect(snapshot.items[1]?.provenance.basis).toBe("adjudication");
    expect(snapshot.items[1]?.answer).toEqual({ category: "b" });
  });

  it("excludes accepted disagreement and incomplete acceptance", () => {
    const snapshot = buildReleaseSnapshot([
      task({
        requiredAnnotations: 2,
        annotations: [
          annotation("a-1", "ACCEPTED", { category: "a" }),
          annotation("a-2", "ACCEPTED", { category: "b" }),
        ],
      }),
      task({
        taskId: "task-2",
        sourceId: "source-2",
        sourceOrder: 2,
        requiredAnnotations: 2,
        status: "ACCEPTED",
        annotations: [annotation("a-3", "ACCEPTED", { category: "a" })],
      }),
    ]);
    expect(snapshot.recordCount).toBe(0);
    expect(snapshot.exclusions.unresolved_disagreement).toBe(1);
    expect(snapshot.exclusions.incomplete_acceptance).toBe(1);
  });

  it("produces deterministic canonical bytes and checksums", () => {
    const first = buildReleaseSnapshot([task()]);
    const second = buildReleaseSnapshot([task()]);
    expect(first.jsonl).toBe(second.jsonl);
    expect(first.csv).toBe(second.csv);
    expect(first.checksums).toEqual(second.checksums);
    expect(sha256Hex(first.jsonl)).toBe(first.checksums.jsonlSha256);
    expect(renderJsonl(first.items)).toBe(first.jsonl);
    expect(renderCsv(first.items)).toBe(first.csv);
    expect(first.jsonl).toContain('"sourceId":"source-1"');
    expect(first.jsonl.endsWith("\n")).toBe(true);
  });

  it("escapes spreadsheet formulas in text cells", () => {
    const snapshot = buildReleaseSnapshot([
      task({
        taskId: "formula",
        sourceId: "=cmd|' /C calc'!A0",
        data: {
          text: "+SUM(1+1)",
          at: "@user",
          dash: "-2+3",
          safe: "plain",
        },
      }),
    ]);
    expect(snapshot.csv).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(snapshot.csv).toContain(`"'+SUM(1+1)"`);
    expect(snapshot.csv).toContain(`"'@user"`);
    expect(snapshot.csv).toContain(`"'-2+3"`);
    expect(snapshot.csv).toContain(`"plain"`);
  });

  it("builds a manifest with counts and checksums", () => {
    const snapshot = buildReleaseSnapshot([task()]);
    const createdAt = new Date("2026-01-02T03:04:05Z");
    const manifest = buildManifest({
      releaseVersion: 3,
      createdAt,
      project: { id: "p", name: "Project" },
      dataset: {
        versionId: "d",
        versionNumber: 1,
        format: "CSV",
        sourceChecksum: "abc",
      },
      schema: {
        versionId: "s",
        versionNumber: 1,
        schema: schemaResult.schema,
      },
      snapshot,
      sourceTaskCount: 1,
    });
    expect(manifest.counts.recordCount).toBe(1);
    expect(manifest.counts.sourceTaskCount).toBe(1);
    expect(manifest.checksums).toEqual(snapshot.checksums);
    expect(manifest.selectionPolicy).toBe("accepted_or_adjudicated_v1");
  });

  it("builds a deterministic bundle", () => {
    const snapshot = buildReleaseSnapshot([task()]);
    const manifest = buildManifest({
      releaseVersion: 1,
      createdAt: new Date("2026-01-02T03:04:05Z"),
      project: { id: "p", name: "Project" },
      dataset: {
        versionId: "d",
        versionNumber: 1,
        format: "CSV",
        sourceChecksum: "abc",
      },
      schema: {
        versionId: "s",
        versionNumber: 1,
        schema: schemaResult.schema,
      },
      snapshot,
      sourceTaskCount: 1,
    });
    const first = buildReleaseBundle({
      manifest,
      jsonl: snapshot.jsonl,
      csv: snapshot.csv,
    });
    const second = buildReleaseBundle({
      manifest,
      jsonl: snapshot.jsonl,
      csv: snapshot.csv,
    });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "dataset.csv",
      "dataset.jsonl",
      "manifest.json",
    ]);
    const parsed = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    expect(parsed.checksums.jsonlSha256).toBe(snapshot.checksums.jsonlSha256);
  });
});

describe("canonical JSON", () => {
  it("sorts object keys recursively and rejects non-finite numbers", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
    expect(() => canonicalJson({ value: Number.NaN })).toThrow();
  });
});
