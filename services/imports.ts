import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound, validationFailed } from "@/lib/errors";
import { isManager } from "@/auth/permissions";
import { LIMITS } from "@/domain/limits";
import { contentHash } from "@/domain/canonical";
import { prepareImport, sanitizeFileName, type ImportFormat, type ImportOptions } from "@/importers";
import { recordAudit } from "@/services/audit";
import { cleanupStaleData } from "@/services/maintenance";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";

export async function createImportPreview(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  fileName: string;
  bytes: Uint8Array;
  format?: ImportFormat;
  options?: ImportOptions;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can import data.");
  }

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
    include: { dataset: { select: { id: true } } },
  });
  if (!project) throw notFound("Project not found.");
  if (project.status !== "ACTIVE") {
    throw conflict("Restore this project before importing data.");
  }
  if (!project.dataset) {
    throw conflict("This project has no dataset container. Recreate the project.");
  }

  await cleanupStaleData().catch(() => undefined);

  const prepared = prepareImport({
    bytes: input.bytes,
    fileName: input.fileName,
    format: input.format,
    options: input.options,
  });

  if (!prepared.ok) {
    throw validationFailed(prepared.message, {
      code: prepared.code,
      fileName: sanitizeFileName(input.fileName),
    });
  }

  const result = prepared.result;
  const expiresAt = new Date(Date.now() + LIMITS.previewTtlMs);
  const previewErrors = result.rows
    .filter((row) => !row.valid)
    .slice(0, LIMITS.previewErrorRows);

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.importBatch.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        createdById: input.user.id,
        fileName: result.fileName,
        format: result.format,
        sourceChecksum: result.sourceChecksum,
        byteSize: result.byteSize,
        parseOptions: {
          delimiter: input.options?.delimiter ?? ",",
          idField: input.options?.idField ?? null,
        },
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
        duplicateRows: result.duplicateRows,
        normalizationNotes: result.notes,
        errorsTruncated: result.invalidRows > previewErrors.length,
        expiresAt,
      },
    });

    if (result.rows.length > 0) {
      await tx.importBatchRow.createMany({
        data: result.rows.map((row) => ({
          batchId: created.id,
          rowNumber: row.rowNumber,
          sourceId: row.sourceId,
          data: row.valid && row.data ? (row.data as Prisma.InputJsonValue) : undefined,
          valid: row.valid,
          errorCode: row.errorCode ?? null,
        })),
      });
    }

    if (previewErrors.length > 0) {
      await tx.importRowError.createMany({
        data: previewErrors.map((row) => ({
          batchId: created.id,
          rowNumber: row.rowNumber,
          field: row.errorField ?? null,
          code: row.errorCode ?? "INVALID_RECORD",
          message: row.errorMessage ?? "The row is invalid.",
        })),
      });
    }

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "import.previewed",
      targetType: "ImportBatch",
      targetId: created.id,
      metadata: {
        projectId: input.projectId,
        format: result.format,
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
        duplicateRows: result.duplicateRows,
      },
    });

    return created;
  });

  return getImportBatch(input.user, batch.id, input.workspaceId);
}

export async function getImportBatch(
  user: SessionUser,
  batchId: string,
  workspaceId: string,
) {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { roles: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE" || !isManager(membership.roles)) {
    throw forbidden("Only workspace owners and managers can view import results.");
  }

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      errors: { orderBy: { rowNumber: "asc" }, take: LIMITS.previewErrorRows },
      rows: {
        orderBy: { rowNumber: "asc" },
        take: 20,
        select: { rowNumber: true, sourceId: true, valid: true, errorCode: true },
      },
    },
  });
  if (!batch) throw notFound("Import batch not found.");

  return {
    id: batch.id,
    fileName: batch.fileName,
    format: batch.format,
    status:
      batch.status === "PREVIEW_READY" && batch.expiresAt.getTime() <= Date.now()
        ? "EXPIRED"
        : batch.status,
    byteSize: batch.byteSize,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    duplicateRows: batch.duplicateRows,
    normalizationNotes: Array.isArray(batch.normalizationNotes)
      ? batch.normalizationNotes
      : [],
    errorsTruncated: batch.errorsTruncated,
    errors: batch.errors.map((error) => ({
      rowNumber: error.rowNumber,
      field: error.field,
      code: error.code,
      message: error.message,
    })),
    sampleRows: batch.rows,
    expiresAt: batch.expiresAt,
    committedAt: batch.committedAt,
    committedVersionId: batch.committedVersionId,
    sourceChecksum: batch.sourceChecksum,
    createdAt: batch.createdAt,
  };
}

export async function commitImport(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  batchId: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can commit imports.");
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        expires_at: Date;
        created_by_id: string;
        project_id: string;
        file_name: string;
        format: string;
        source_checksum: string;
      }>
    >`
      SELECT id,
             status::text AS status,
             "expiresAt" AS expires_at,
             "createdById" AS created_by_id,
             "projectId" AS project_id,
             "fileName" AS file_name,
             "format"::text AS format,
             "sourceChecksum" AS source_checksum
      FROM "ImportBatch"
      WHERE id = ${input.batchId}
      FOR UPDATE
    `;
    const batch = locked[0];
    if (!batch) throw notFound("Import batch not found.");
    if (batch.project_id !== input.projectId) {
      throw notFound("Import batch not found.");
    }
    if (batch.created_by_id !== input.user.id) {
      throw forbidden("Only the manager who created this preview can commit it.");
    }
    if (batch.status !== "PREVIEW_READY") {
      throw conflict(
        batch.status === "COMMITTED"
          ? "This preview has already been committed."
          : "This preview can no longer be committed.",
      );
    }
    if (batch.expires_at.getTime() <= Date.now()) {
      throw new AppError(
        "IMPORT_EXPIRED",
        "This preview expired. Upload the file again.",
        409,
      );
    }

    const project = await tx.project.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
      include: { dataset: { select: { id: true } } },
    });
    if (!project) throw notFound("Project not found.");
    if (!project.dataset) throw conflict("This project has no dataset container.");

    const rows = await tx.importBatchRow.findMany({
      where: { batchId: input.batchId, valid: true },
      orderBy: { rowNumber: "asc" },
    });
    if (rows.length === 0) {
      throw validationFailed("There are no valid rows to commit.");
    }

    await tx.$queryRaw`SELECT id FROM "Dataset" WHERE id = ${project.dataset.id} FOR UPDATE`;

    const existingRecordCount = await tx.datasetRecord.count({
      where: { datasetVersion: { datasetId: project.dataset.id } },
    });
    if (existingRecordCount + rows.length > LIMITS.recordsPerProject) {
      throw conflict(
        `This project can hold ${LIMITS.recordsPerProject.toLocaleString()} records. It already holds ${existingRecordCount.toLocaleString()}.`,
      );
    }

    const maxVersion = await tx.datasetVersion.aggregate({
      where: { datasetId: project.dataset.id },
      _max: { versionNumber: true },
    });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

    const canonicalRows = rows.map((row) => ({
      sourceId: row.sourceId ?? "",
      sourceOrder: row.rowNumber,
      data: row.data,
    }));
    const contentChecksum = contentHash(canonicalRows);

    const version = await tx.datasetVersion.create({
      data: {
        datasetId: project.dataset.id,
        versionNumber,
        format: batch.format === "JSONL" ? "JSONL" : "CSV",
        sourceFileName: batch.file_name,
        sourceChecksum: batch.source_checksum,
        contentChecksum,
        recordCount: rows.length,
        importedById: input.user.id,
      },
    });

    await tx.datasetRecord.createMany({
      data: rows.map((row) => ({
        datasetVersionId: version.id,
        sourceId: row.sourceId ?? `row-${row.rowNumber}`,
        sourceOrder: row.rowNumber,
        data: (row.data ?? {}) as Prisma.InputJsonValue,
        contentHash: contentHash({ sourceId: row.sourceId, data: row.data }),
      })),
    });

    await tx.dataset.update({
      where: { id: project.dataset.id },
      data: { currentVersionId: version.id },
    });
    await tx.importBatch.update({
      where: { id: input.batchId },
      data: {
        status: "COMMITTED",
        committedAt: new Date(),
        committedVersionId: version.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "import.committed",
      targetType: "DatasetVersion",
      targetId: version.id,
      metadata: {
        projectId: input.projectId,
        versionNumber,
        recordCount: rows.length,
        contentChecksum,
      },
    });

    return {
      versionId: version.id,
      versionNumber,
      recordCount: rows.length,
      contentChecksum,
    };
  });
}
