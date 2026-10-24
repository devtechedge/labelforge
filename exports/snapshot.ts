import {
  canonicalJson,
  contentHash,
  sha256Hex,
  type JsonValue,
} from "@/domain/canonical";
import type { AnnotationSchema } from "@/domain/schema";

export const RELEASE_SELECTION_POLICY = "accepted_or_adjudicated_v1";

export type SnapshotAnnotation = {
  id: string;
  status: string;
  answer: JsonValue;
  revision: number;
};

export type SnapshotAdjudication = {
  id: string;
  finalAnswer: JsonValue;
  chosenAnnotationId: string | null;
  rationale: string;
  createdAt: Date;
};

export type SnapshotTaskInput = {
  taskId: string;
  status: string;
  requiredAnnotations: number;
  datasetRecordId: string;
  sourceId: string;
  sourceOrder: number;
  data: JsonValue;
  schemaVersionId: string;
  annotations: SnapshotAnnotation[];
  adjudication: SnapshotAdjudication | null;
};

export type ReleaseProvenance = {
  taskId: string;
  taskStatus: string;
  basis: "adjudication" | "accepted_agreement";
  schemaVersionId: string;
  requiredAnnotations: number;
  annotationIds: string[];
  annotationStatuses: Array<{ id: string; status: string; revision: number }>;
  adjudicationId: string | null;
  chosenAnnotationId: string | null;
};

export type ReleaseItemSnapshot = {
  position: number;
  sourceId: string;
  sourceOrder: number;
  data: JsonValue;
  answer: JsonValue;
  provenance: ReleaseProvenance;
  contentHash: string;
};

export type ExclusionReason =
  | "task_not_final"
  | "no_accepted_annotation"
  | "incomplete_acceptance"
  | "unresolved_disagreement"
  | "resolved_without_adjudication"
  | "duplicate_source_id";

export type ReleaseSnapshot = {
  items: ReleaseItemSnapshot[];
  recordCount: number;
  annotationCount: number;
  excludedCount: number;
  exclusions: Record<ExclusionReason, number>;
  jsonl: string;
  csv: string;
  checksums: { jsonlSha256: string; csvSha256: string };
};

const EMPTY_EXCLUSIONS: Record<ExclusionReason, number> = {
  task_not_final: 0,
  no_accepted_annotation: 0,
  incomplete_acceptance: 0,
  unresolved_disagreement: 0,
  resolved_without_adjudication: 0,
  duplicate_source_id: 0,
};

export function buildReleaseSnapshot(tasks: SnapshotTaskInput[]): ReleaseSnapshot {
  const ordered = [...tasks].sort(
    (a, b) => a.sourceOrder - b.sourceOrder || a.sourceId.localeCompare(b.sourceId),
  );
  const exclusions = { ...EMPTY_EXCLUSIONS };
  const items: ReleaseItemSnapshot[] = [];
  const seenSourceIds = new Set<string>();

  for (const task of ordered) {
    if (seenSourceIds.has(task.sourceId)) {
      exclusions.duplicate_source_id += 1;
      continue;
    }

    const nonDraft = task.annotations.filter((annotation) => annotation.status !== "DRAFT");
    let answer: JsonValue | null = null;
    let basis: ReleaseProvenance["basis"] | null = null;
    let annotationIds: string[] = [];
    let adjudicationId: string | null = null;
    let chosenAnnotationId: string | null = null;

    if (task.status === "RESOLVED") {
      if (!task.adjudication) {
        exclusions.resolved_without_adjudication += 1;
        continue;
      }
      answer = task.adjudication.finalAnswer;
      basis = "adjudication";
      adjudicationId = task.adjudication.id;
      chosenAnnotationId = task.adjudication.chosenAnnotationId;
      annotationIds = nonDraft.map((annotation) => annotation.id);
    } else if (task.status === "ACCEPTED") {
      const accepted = nonDraft
        .filter((annotation) => annotation.status === "ACCEPTED")
        .sort((a, b) => a.id.localeCompare(b.id));
      if (accepted.length < task.requiredAnnotations) {
        exclusions.incomplete_acceptance += 1;
        continue;
      }
      if (accepted.length === 0) {
        exclusions.no_accepted_annotation += 1;
        continue;
      }
      const first = accepted[0];
      if (!first) {
        exclusions.no_accepted_annotation += 1;
        continue;
      }
      const firstCanonical = canonicalJson(first.answer);
      const agrees = accepted.every(
        (annotation) => canonicalJson(annotation.answer) === firstCanonical,
      );
      if (!agrees) {
        exclusions.unresolved_disagreement += 1;
        continue;
      }
      answer = first.answer;
      basis = "accepted_agreement";
      annotationIds = accepted.map((annotation) => annotation.id);
    } else {
      exclusions.task_not_final += 1;
      continue;
    }

    seenSourceIds.add(task.sourceId);
    items.push({
      position: items.length + 1,
      sourceId: task.sourceId,
      sourceOrder: task.sourceOrder,
      data: task.data,
      answer: answer as JsonValue,
      provenance: {
        taskId: task.taskId,
        taskStatus: task.status,
        basis: basis as ReleaseProvenance["basis"],
        schemaVersionId: task.schemaVersionId,
        requiredAnnotations: task.requiredAnnotations,
        annotationIds,
        annotationStatuses: nonDraft.map((annotation) => ({
          id: annotation.id,
          status: annotation.status,
          revision: annotation.revision,
        })),
        adjudicationId,
        chosenAnnotationId,
      },
      contentHash: contentHash({ data: task.data, answer }),
    });
  }

  const jsonl = renderJsonl(items);
  const csv = renderCsv(items);

  return {
    items,
    recordCount: items.length,
    annotationCount: new Set(
      items.flatMap((item) => item.provenance.annotationIds),
    ).size,
    excludedCount: Object.values(exclusions).reduce((sum, count) => sum + count, 0),
    exclusions,
    jsonl,
    csv,
    checksums: { jsonlSha256: sha256Hex(jsonl), csvSha256: sha256Hex(csv) },
  };
}

function escapeCsvText(value: string): string {
  let sanitized = value;
  if (/^[=+\-@\t\r]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function renderCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return escapeCsvText(value);
  return escapeCsvText(canonicalJson(value));
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function renderCsv(items: ReleaseItemSnapshot[]): string {
  const recordKeys = new Set<string>();
  const answerKeys = new Set<string>();
  for (const item of items) {
    if (isPlainObject(item.data)) {
      for (const key of Object.keys(item.data)) recordKeys.add(key);
    }
    if (isPlainObject(item.answer)) {
      for (const key of Object.keys(item.answer)) answerKeys.add(key);
    }
  }
  const sortedRecordKeys = [...recordKeys].sort();
  const sortedAnswerKeys = [...answerKeys].sort();

  const header = [
    "source_id",
    "source_order",
    ...sortedRecordKeys.map((key) => `record.${key}`),
    ...sortedAnswerKeys.map((key) => `answer.${key}`),
    "task_id",
    "task_status",
    "answer_basis",
    "annotation_ids",
    "adjudication_id",
    "schema_version_id",
  ];

  const lines = [header.map((cell) => escapeCsvText(cell)).join(",")];
  for (const item of items) {
    const record = isPlainObject(item.data) ? item.data : {};
    const answer = isPlainObject(item.answer) ? item.answer : {};
    const cells = [
      escapeCsvText(item.sourceId),
      renderCsvCell(item.sourceOrder),
      ...sortedRecordKeys.map((key) => renderCsvCell(record[key])),
      ...sortedAnswerKeys.map((key) => renderCsvCell(answer[key])),
      escapeCsvText(item.provenance.taskId),
      escapeCsvText(item.provenance.taskStatus),
      escapeCsvText(item.provenance.basis),
      escapeCsvText(item.provenance.annotationIds.join(";")),
      renderCsvCell(item.provenance.adjudicationId),
      escapeCsvText(item.provenance.schemaVersionId),
    ];
    lines.push(cells.join(","));
  }

  return `${lines.join("\r\n")}\r\n`;
}

export type ReleaseManifest = {
  manifestFormat: "labelforge.release-manifest.v1";
  selectionPolicy: typeof RELEASE_SELECTION_POLICY;
  releaseVersion: number;
  createdAt: string;
  project: { id: string; name: string };
  dataset: { versionId: string; versionNumber: number; format: string; sourceChecksum: string };
  schema: { versionId: string; versionNumber: number; schema: AnnotationSchema };
  counts: {
    sourceTaskCount: number;
    recordCount: number;
    annotationCount: number;
    excludedCount: number;
    exclusions: Record<ExclusionReason, number>;
  };
  checksums: { jsonlSha256: string; csvSha256: string };
  exportContract: {
    order: string;
    jsonl: string;
    csv: string;
    csvFormulaProtection: string;
  };
  limitations: string[];
  notes?: string;
};

export function buildManifest(input: {
  releaseVersion: number;
  createdAt: Date;
  project: { id: string; name: string };
  dataset: {
    versionId: string;
    versionNumber: number;
    format: string;
    sourceChecksum: string;
  };
  schema: { versionId: string; versionNumber: number; schema: AnnotationSchema };
  snapshot: ReleaseSnapshot;
  sourceTaskCount: number;
  notes?: string;
}): ReleaseManifest {
  return {
    manifestFormat: "labelforge.release-manifest.v1",
    selectionPolicy: RELEASE_SELECTION_POLICY,
    releaseVersion: input.releaseVersion,
    createdAt: input.createdAt.toISOString(),
    project: input.project,
    dataset: input.dataset,
    schema: input.schema,
    counts: {
      sourceTaskCount: input.sourceTaskCount,
      recordCount: input.snapshot.recordCount,
      annotationCount: input.snapshot.annotationCount,
      excludedCount: input.snapshot.excludedCount,
      exclusions: input.snapshot.exclusions,
    },
    checksums: input.snapshot.checksums,
    exportContract: {
      order: "sourceOrder ascending, then sourceId",
      jsonl: "One canonical JSON object per line with sourceId, sourceOrder, record, answer, and provenance.",
      csv: "UTF-8, CRLF, one header row, deterministic column order, all text values quoted.",
      csvFormulaProtection:
        "Text cells beginning with =, +, -, @, tab, or carriage return are prefixed with an apostrophe.",
    },
    limitations: [
      "A release is a snapshot of accepted or adjudicated tasks at publication time. Later edits do not mutate it.",
      "Tasks that are not accepted, not fully accepted, or contain unresolved disagreement are excluded and counted.",
      "The CSV checksum covers the formula-safe CSV representation, not the JSONL representation.",
    ],
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

export function renderJsonl(items: ReleaseItemSnapshot[]): string {
  return items
    .map((item) =>
      canonicalJson({
        sourceId: item.sourceId,
        sourceOrder: item.sourceOrder,
        record: item.data,
        answer: item.answer,
        provenance: item.provenance,
      }),
    )
    .join("\n") + (items.length > 0 ? "\n" : "");
}
