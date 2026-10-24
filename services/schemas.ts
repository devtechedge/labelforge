import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, validationFailed } from "@/lib/errors";
import { isManager } from "@/auth/permissions";
import { parseAnnotationSchema } from "@/domain/schema";
import { recordAudit } from "@/services/audit";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";

export async function listSchemaVersions(projectId: string) {
  return prisma.annotationSchemaVersion.findMany({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    include: {
      createdBy: { select: { displayName: true } },
      publishedBy: { select: { displayName: true } },
      _count: { select: { tasks: true, annotations: true, releases: true } },
    },
  });
}

export async function createSchemaVersion(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  schema: unknown;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can define schemas.");
  }

  const parsed = parseAnnotationSchema(input.schema);
  if (!parsed.ok) {
    throw validationFailed("The schema does not validate.", {
      issues: parsed.issues,
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
  });
  if (!project) throw notFound("Project not found.");
  if (project.status !== "ACTIVE") {
    throw conflict("Restore this project before creating a schema.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;
    const maxVersion = await tx.annotationSchemaVersion.aggregate({
      where: { projectId: input.projectId },
      _max: { versionNumber: true },
    });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

    const schema = await tx.annotationSchemaVersion.create({
      data: {
        projectId: input.projectId,
        versionNumber,
        schemaJson: parsed.schema as unknown as Prisma.InputJsonValue,
        status: "DRAFT",
        createdById: input.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "schema.created",
      targetType: "AnnotationSchemaVersion",
      targetId: schema.id,
      metadata: {
        projectId: input.projectId,
        versionNumber,
        fieldCount: parsed.schema.fields.length,
      },
    });

    return schema;
  });
}

export async function publishSchemaVersion(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  schemaVersionId: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can publish schemas.");
  }

  const schema = await prisma.annotationSchemaVersion.findFirst({
    where: {
      id: input.schemaVersionId,
      projectId: input.projectId,
      project: { workspaceId: input.workspaceId },
    },
  });
  if (!schema) throw notFound("Schema version not found.");
  if (schema.status === "PUBLISHED") return schema;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.annotationSchemaVersion.updateMany({
      where: { id: schema.id, status: "DRAFT" },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: input.user.id,
      },
    });
    if (updated.count === 0) {
      const current = await tx.annotationSchemaVersion.findUnique({
        where: { id: schema.id },
      });
      if (current?.status === "PUBLISHED") return current;
      throw conflict("This schema version cannot be published.");
    }
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "schema.published",
      targetType: "AnnotationSchemaVersion",
      targetId: schema.id,
      metadata: {
        projectId: input.projectId,
        versionNumber: schema.versionNumber,
      },
    });
    return tx.annotationSchemaVersion.findUniqueOrThrow({ where: { id: schema.id } });
  });
}

export async function generateTasks(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  schemaVersionId: string;
  datasetVersionId: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can generate tasks.");
  }

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId },
    include: { dataset: true },
  });
  if (!project) throw notFound("Project not found.");
  if (!project.dataset) throw conflict("This project has no dataset container.");
  if (project.status !== "ACTIVE") throw conflict("Restore this project first.");

  const schema = await prisma.annotationSchemaVersion.findFirst({
    where: {
      id: input.schemaVersionId,
      projectId: input.projectId,
      status: "PUBLISHED",
    },
  });
  if (!schema) throw conflict("Publish the schema version before generating tasks.");

  const version = await prisma.datasetVersion.findFirst({
    where: { id: input.datasetVersionId, datasetId: project.dataset.id },
    include: { records: { orderBy: { sourceOrder: "asc" } } },
  });
  if (!version) throw notFound("Dataset version not found.");
  if (version.records.length === 0) throw conflict("This dataset version has no records.");

  const requiredAnnotations =
    project.annotationMode === "SINGLE" ? 1 : project.annotationsPerTask;

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.annotationTask.createMany({
      data: version.records.map((record) => ({
        projectId: project.id,
        datasetVersionId: version.id,
        datasetRecordId: record.id,
        schemaVersionId: schema.id,
        requiredAnnotations,
        status: "UNASSIGNED" as const,
      })),
      skipDuplicates: true,
    });

    await tx.dataset.update({
      where: { id: project.dataset!.id },
      data: { currentVersionId: version.id },
    });

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "tasks.generated",
      targetType: "AnnotationTask",
      targetId: schema.id,
      metadata: {
        projectId: project.id,
        datasetVersionId: version.id,
        schemaVersionId: schema.id,
        created: created.count,
        skipped: version.records.length - created.count,
      },
    });

    return { created: created.count, skipped: version.records.length - created.count };
  });

  return result;
}

export async function applySchemaToUnstartedTasks(input: {
  user: SessionUser;
  workspaceId: string;
  projectId: string;
  roles: WorkspaceRole[];
  schemaVersionId: string;
}) {
  if (!isManager(input.roles)) {
    throw forbidden("Only workspace owners and managers can move unstarted tasks.");
  }

  const schema = await prisma.annotationSchemaVersion.findFirst({
    where: {
      id: input.schemaVersionId,
      projectId: input.projectId,
      project: { workspaceId: input.workspaceId },
      status: "PUBLISHED",
    },
  });
  if (!schema) throw conflict("Choose a published schema version.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "AnnotationTask" AS t
      SET "schemaVersionId" = ${schema.id},
          version = version + 1,
          "updatedAt" = now()
      WHERE t."projectId" = ${input.projectId}
        AND t."schemaVersionId" <> ${schema.id}
        AND t.status IN ('UNASSIGNED', 'ASSIGNED')
        AND NOT EXISTS (
          SELECT 1 FROM "Annotation" a WHERE a."taskId" = t.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "AnnotationTask" existing
          WHERE existing."datasetRecordId" = t."datasetRecordId"
            AND existing."schemaVersionId" = ${schema.id}
        )
    `;

    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      action: "schema.applied_to_unstarted",
      targetType: "AnnotationSchemaVersion",
      targetId: schema.id,
      metadata: {
        projectId: input.projectId,
        updatedTasks: updated,
      },
    });

    return { updated };
  });
}
