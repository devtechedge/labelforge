import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { isManager } from "@/auth/permissions";
import { parseAnnotationSchema } from "@/domain/schema";
import { sha256Hex, type JsonValue } from "@/domain/canonical";
import {
  buildManifest,
  buildReleaseSnapshot,
  renderCsv,
  renderJsonl,
  type ReleaseItemSnapshot,
  type SnapshotTaskInput,
} from "@/exports/snapshot";
import { recordAudit } from "@/services/audit";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";
import { LIMITS } from "@/domain/limits";

export async function publishRelease(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  schemaVersionId: string;
  datasetVersionId?: string;
  notes?: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can publish releases.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;

      const project = await tx.project.findFirst({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        include: { dataset: true, workspace: { select: { id: true, name: true } } },
      });
      if (!project) throw notFound("Project not found.");
      if (!project.dataset) throw conflict("This project has no dataset.");
      if (project.status !== "ACTIVE") throw conflict("Restore this project first.");

      const schema = await tx.annotationSchemaVersion.findFirst({
        where: {
          id: input.schemaVersionId,
          projectId: input.projectId,
          status: "PUBLISHED",
        },
      });
      if (!schema) throw conflict("Choose a published schema version for this release.");
      const parsedSchema = parseAnnotationSchema(schema.schemaJson);
      if (!parsedSchema.ok) throw conflict("The schema version is unreadable.");

      const datasetVersion = await tx.datasetVersion.findFirst({
        where: {
          datasetId: project.dataset.id,
          ...(input.datasetVersionId
            ? { id: input.datasetVersionId }
            : { id: project.dataset.currentVersionId ?? "__none__" }),
        },
      });
      if (!datasetVersion) throw conflict("Choose a committed dataset version.");

      const tasks = await tx.annotationTask.findMany({
        where: {
          projectId: input.projectId,
          schemaVersionId: schema.id,
          datasetVersionId: datasetVersion.id,
        },
        include: {
          datasetRecord: true,
          annotations: {
            where: { status: { not: "DRAFT" } },
            select: { id: true, status: true, answer: true, revision: true },
          },
          adjudications: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { datasetRecord: { sourceOrder: "asc" } },
      });

      if (tasks.length === 0) {
        throw conflict(
          "No tasks exist for that dataset and schema version. Generate and review tasks first.",
        );
      }

      const snapshotInputs: SnapshotTaskInput[] = tasks.map((task) => ({
        taskId: task.id,
        status: task.status,
        requiredAnnotations: task.requiredAnnotations,
        datasetRecordId: task.datasetRecordId,
        sourceId: task.datasetRecord.sourceId,
        sourceOrder: task.datasetRecord.sourceOrder,
        data: task.datasetRecord.data as JsonValue,
        schemaVersionId: task.schemaVersionId,
        annotations: task.annotations.map((annotation) => ({
          id: annotation.id,
          status: annotation.status,
          answer: annotation.answer as JsonValue,
          revision: annotation.revision,
        })),
        adjudication: task.adjudications[0]
          ? {
              id: task.adjudications[0].id,
              finalAnswer: task.adjudications[0].finalAnswer as JsonValue,
              chosenAnnotationId: task.adjudications[0].chosenAnnotationId,
              rationale: task.adjudications[0].rationale,
              createdAt: task.adjudications[0].createdAt,
            }
          : null,
      }));

      const snapshot = buildReleaseSnapshot(snapshotInputs);
      if (snapshot.recordCount === 0) {
        throw conflict("No accepted or adjudicated tasks are ready for release.", {
          exclusions: snapshot.exclusions,
        });
      }

      const maxRelease = await tx.datasetRelease.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const versionNumber = (maxRelease._max.versionNumber ?? 0) + 1;
      const now = new Date();

      const manifest = buildManifest({
        releaseVersion: versionNumber,
        createdAt: now,
        project: { id: project.id, name: project.name },
        dataset: {
          versionId: datasetVersion.id,
          versionNumber: datasetVersion.versionNumber,
          format: datasetVersion.format,
          sourceChecksum: datasetVersion.sourceChecksum,
        },
        schema: {
          versionId: schema.id,
          versionNumber: schema.versionNumber,
          schema: parsedSchema.schema,
        },
        snapshot,
        sourceTaskCount: tasks.length,
        notes: input.notes,
      });

      const release = await tx.datasetRelease.create({
        data: {
          projectId: project.id,
          versionNumber,
          datasetVersionId: datasetVersion.id,
          schemaVersionId: schema.id,
          selectionPolicy: manifest.selectionPolicy,
          recordCount: snapshot.recordCount,
          annotationCount: snapshot.annotationCount,
          excludedCount: snapshot.excludedCount,
          checksum: snapshot.checksums.jsonlSha256,
          csvChecksum: snapshot.checksums.csvSha256,
          manifest: manifest as unknown as Prisma.InputJsonValue,
          status: "PUBLISHED",
          createdById: input.user.id,
          createdAt: now,
          publishedAt: now,
        },
      });

      const recordIdByTask = new Map(
        snapshotInputs.map((task) => [task.taskId, task.datasetRecordId]),
      );
      await tx.releaseItem.createMany({
        data: snapshot.items.map((item) => ({
          releaseId: release.id,
          position: item.position,
          sourceOrder: item.sourceOrder,
          datasetRecordId: recordIdByTask.get(item.provenance.taskId),
          taskId: item.provenance.taskId,
          sourceId: item.sourceId,
          data: item.data as Prisma.InputJsonValue,
          answer: item.answer as Prisma.InputJsonValue,
          provenance: item.provenance as unknown as Prisma.InputJsonValue,
          contentHash: item.contentHash,
        })),
      });

      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorId: input.user.id,
        action: "release.published",
        targetType: "DatasetRelease",
        targetId: release.id,
        metadata: {
          projectId: project.id,
          versionNumber,
          recordCount: snapshot.recordCount,
          excludedCount: snapshot.excludedCount,
          checksum: snapshot.checksums.jsonlSha256,
        },
      });

      return {
        releaseId: release.id,
        versionNumber,
        recordCount: snapshot.recordCount,
        excludedCount: snapshot.excludedCount,
        checksum: snapshot.checksums.jsonlSha256,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listReleases(projectId: string, page = 1) {
  const [releases, total] = await Promise.all([
    prisma.datasetRelease.findMany({
      where: { projectId },
      orderBy: { versionNumber: "desc" },
      skip: (page - 1) * LIMITS.releasesPerPage,
      take: LIMITS.releasesPerPage,
      include: { createdBy: { select: { displayName: true } } },
    }),
    prisma.datasetRelease.count({ where: { projectId } }),
  ]);
  return { releases, total };
}

export async function getReleaseExport(user: SessionUser, releaseId: string) {
  const release = await prisma.datasetRelease.findUnique({
    where: { id: releaseId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          workspaceId: true,
          workspace: { select: { name: true } },
        },
      },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!release) throw notFound("Release not found.");

  const membership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: release.project.workspaceId,
        userId: user.id,
      },
    },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw notFound("Release not found.");
  }

  const items: ReleaseItemSnapshot[] = release.items.map((item) => ({
    position: item.position,
    sourceId: item.sourceId,
    sourceOrder: item.sourceOrder,
    data: item.data as JsonValue,
    answer: item.answer as JsonValue,
    provenance: item.provenance as unknown as ReleaseItemSnapshot["provenance"],
    contentHash: item.contentHash,
  }));

  return { release, membership, items };
}

export function verifyReleaseIntegrity(
  release: { checksum: string; csvChecksum: string },
  items: ReleaseItemSnapshot[],
): { jsonl: string; csv: string } {
  const jsonl = renderJsonl(items);
  const csv = renderCsv(items);
  const jsonlChecksum = sha256Hex(jsonl);
  const csvChecksum = sha256Hex(csv);
  if (jsonlChecksum !== release.checksum || csvChecksum !== release.csvChecksum) {
    throw new AppError(
      "RELEASE_INTEGRITY",
      "Release contents no longer match the published checksums.",
      500,
      { expected: release.checksum, actual: jsonlChecksum },
    );
  }
  return { jsonl, csv };
}


export async function recordExportAudit(input: {
  user: SessionUser;
  workspaceId: string;
  releaseId: string;
  format: string;
}) {
  await recordAudit(prisma, {
    workspaceId: input.workspaceId,
    actorId: input.user.id,
    action: "release.exported",
    targetType: "DatasetRelease",
    targetId: input.releaseId,
    metadata: { format: input.format },
  });
}
