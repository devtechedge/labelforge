import "server-only";

import { prisma } from "@/lib/db";
import { metricForField, type AgreementMetric } from "@/domain/agreement";
import { parseAnnotationSchema, type SchemaField } from "@/domain/schema";
import { TASK_STATUS_LABELS } from "@/domain/workflow";

export const QUALITY_ANNOTATION_LIMIT = 20_000;

export async function getProjectQuality(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true },
  });
  if (!project) return null;

  const [taskGroups, annotationGroups, reviewGroups, schemaVersions, tasks] =
    await Promise.all([
      prisma.annotationTask.groupBy({
        by: ["status"],
        where: { projectId },
        _count: { _all: true },
      }),
      prisma.annotation.groupBy({
        by: ["status"],
        where: { task: { projectId } },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["decision"],
        where: { task: { projectId } },
        _count: { _all: true },
      }),
      prisma.annotationSchemaVersion.findMany({
        where: { projectId },
        orderBy: { versionNumber: "desc" },
        select: { id: true, versionNumber: true, schemaJson: true, status: true },
      }),
      prisma.annotationTask.findMany({
        where: { projectId },
        select: {
          id: true,
          status: true,
          schemaVersionId: true,
          requiredAnnotations: true,
          annotations: {
            where: { status: { in: ["SUBMITTED", "ACCEPTED", "DISPUTED"] } },
            select: { id: true, taskId: true, status: true, answer: true },
          },
          adjudications: { select: { id: true } },
        },
      }),
    ]);

  const totalTasks = tasks.length;
  const finalized = tasks.filter(
    (task) => task.status === "ACCEPTED" || task.status === "RESOLVED",
  ).length;
  const reviewPending = tasks.filter(
    (task) => task.status === "SUBMITTED" || task.status === "IN_REVIEW",
  ).length;
  const disputed = tasks.filter(
    (task) => task.status === "DISPUTED" || task.status === "ADJUDICATION",
  ).length;

  const schemaMap = new Map(
    schemaVersions.map((version) => [version.id, version]),
  );

  let annotationSample = 0;
  const bySchema = new Map<
    string,
    Array<{ taskId: string; annotations: Array<{ status: string; answer: unknown }> }>
  >();

  for (const task of tasks) {
    if (task.adjudications.length > 0) continue;
    const comparable = task.annotations.filter(
      (annotation) => annotation.status !== "DRAFT",
    );
    if (comparable.length < 2) continue;
    annotationSample += comparable.length;
    if (annotationSample > QUALITY_ANNOTATION_LIMIT) break;
    const group = bySchema.get(task.schemaVersionId) ?? [];
    group.push({
      taskId: task.id,
      annotations: comparable.map((annotation) => ({
        status: annotation.status,
        answer: annotation.answer,
      })),
    });
    bySchema.set(task.schemaVersionId, group);
  }

  const schemaQuality = [...bySchema.entries()].map(([schemaVersionId, taskGroups]) => {
    const version = schemaMap.get(schemaVersionId);
    const parsed = parseAnnotationSchema(version?.schemaJson);
    if (!version || !parsed.ok) {
      return {
        schemaVersionId,
        versionNumber: version?.versionNumber ?? 0,
        status: version?.status ?? "DRAFT",
        fields: [],
        comparableTasks: taskGroups.length,
        parseError: true,
      };
    }

    const fields = parsed.schema.fields
      .filter((field) => field.type === "single_select" || field.type === "multi_select" || field.type === "span")
      .map((field) => {
        const pairs: Array<{ a: unknown; b: unknown }> = [];
        let missing = 0;
        for (const task of taskGroups) {
          for (let i = 0; i < task.annotations.length; i += 1) {
            for (let j = i + 1; j < task.annotations.length; j += 1) {
              const first = task.annotations[i];
              const second = task.annotations[j];
              if (!first || !second) continue;
              const answerA = asAnswer(first.answer);
              const answerB = asAnswer(second.answer);
              if (answerA[field.key] === undefined || answerB[field.key] === undefined) {
                missing += 1;
                continue;
              }
              pairs.push({ a: answerA[field.key], b: answerB[field.key] });
            }
          }
        }
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          type: field.type,
          metric: withLimitations(metricForField(field, pairs), field),
          comparablePairs: pairs.length,
          pairsWithMissingValue: missing,
        };
      });

    return {
      schemaVersionId,
      versionNumber: version.versionNumber,
      status: version.status,
      fields,
      comparableTasks: taskGroups.length,
      parseError: false,
    };
  });

  return {
    project,
    taskStatusCounts: Object.fromEntries(
      taskGroups.map((group) => [group.status, group._count._all]),
    ),
    taskStatusLabels: TASK_STATUS_LABELS,
    annotationStatusCounts: Object.fromEntries(
      annotationGroups.map((group) => [group.status, group._count._all]),
    ),
    reviewDecisionCounts: Object.fromEntries(
      reviewGroups.map((group) => [group.decision, group._count._all]),
    ),
    totals: {
      totalTasks,
      finalized,
      reviewPending,
      disputed,
      completeness: totalTasks === 0 ? null : finalized / totalTasks,
    },
    schemaQuality,
    annotationSample,
    sampleTruncated: annotationSample >= QUALITY_ANNOTATION_LIMIT,
  };
}

function asAnswer(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function withLimitations(metric: AgreementMetric, field: SchemaField): AgreementMetric {
  const limitations = [...metric.limitations];
  limitations.push({
    code: "pairwise",
    message:
      "Each pair of non-draft annotations on the same task contributes once. Pairs are not independent when one annotator covers many tasks.",
  });
  limitations.push({
    code: "field_scope",
    message: `This measure covers the "${field.label}" field only. Missing values are skipped and reported separately.`,
  });
  return { ...metric, limitations };
}

export type ProjectQuality = NonNullable<Awaited<ReturnType<typeof getProjectQuality>>>;
