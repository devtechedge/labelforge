import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/auth/session";
import { parseAnnotationSchema } from "@/domain/schema";
import { contentHash } from "@/domain/canonical";

export type TestUser = SessionUser & { passwordHash?: string };

const TABLES = [
  "RateLimitBucket",
  "AuditEvent",
  "ImportRowError",
  "ImportBatchRow",
  "ImportBatch",
  "ReleaseItem",
  "DatasetRelease",
  "Adjudication",
  "Review",
  "Annotation",
  "TaskAssignment",
  "AnnotationTask",
  "AnnotationSchemaVersion",
  "DatasetRecord",
  "DatasetVersion",
  "Dataset",
  "Project",
  "Invitation",
  "Membership",
  "Workspace",
  "Session",
  "User",
];

export async function resetDatabase(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export async function createUser(label: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${randomUUID()}@test.local`,
      displayName: `${label} tester`,
      passwordHash: "test-password-hash",
    },
  });
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function addMember(
  workspaceId: string,
  userId: string,
  roles: WorkspaceRole[],
) {
  return prisma.membership.create({
    data: { workspaceId, userId, roles, status: "ACTIVE" },
  });
}

export const schemaJson = (() => {
  const parsed = parseAnnotationSchema({
    kind: "labelforge.annotation-schema",
    version: 1,
    title: "Integration schema",
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
      {
        key: "note",
        label: "Note",
        type: "text",
        required: false,
        maxLength: 200,
      },
    ],
  });
  if (!parsed.ok) throw new Error("Integration schema invalid");
  return parsed.schema;
})();

export async function createEmptyProject(label = "project") {
  const owner = await createUser(`${label}-owner`);
  const workspace = await prisma.workspace.create({
    data: {
      name: `${label} workspace`,
      slug: `${label}-${randomUUID().slice(0, 8)}`,
      ownerId: owner.id,
      memberships: {
        create: { userId: owner.id, roles: ["OWNER"], status: "ACTIVE" },
      },
      projects: {
        create: {
          name: `${label} project`,
          description: "Integration fixture",
          annotationMode: "SINGLE",
          annotationsPerTask: 1,
          createdById: owner.id,
          dataset: { create: { name: `${label} dataset` } },
        },
      },
    },
    include: {
      projects: { include: { dataset: true } },
    },
  });
  const project = workspace.projects[0];
  const dataset = project?.dataset;
  if (!project || !dataset) throw new Error("Fixture project creation failed");
  return { owner, workspace, project, dataset };
}

export async function createScenario(options?: {
  mode?: "SINGLE" | "MULTI";
  required?: number;
  recordCount?: number;
  label?: string;
}) {
  const label = options?.label ?? "scenario";
  const mode = options?.mode ?? "SINGLE";
  const required = options?.required ?? 1;
  const recordCount = options?.recordCount ?? 1;

  const owner = await createUser(`${label}-owner`);
  const annotator = await createUser(`${label}-annotator`);
  const secondAnnotator = await createUser(`${label}-annotator-2`);
  const reviewer = await createUser(`${label}-reviewer`);
  const outsider = await createUser(`${label}-outsider`);

  const workspace = await prisma.workspace.create({
    data: {
      name: `${label} workspace`,
      slug: `${label}-${randomUUID().slice(0, 8)}`,
      ownerId: owner.id,
      memberships: {
        create: [
          { userId: owner.id, roles: ["OWNER"], status: "ACTIVE" },
          { userId: annotator.id, roles: ["ANNOTATOR"], status: "ACTIVE" },
          { userId: secondAnnotator.id, roles: ["ANNOTATOR"], status: "ACTIVE" },
          { userId: reviewer.id, roles: ["REVIEWER"], status: "ACTIVE" },
        ],
      },
      projects: {
        create: {
          name: `${label} project`,
          description: "Integration fixture",
          annotationMode: mode,
          annotationsPerTask: required,
          createdById: owner.id,
          dataset: { create: { name: `${label} dataset` } },
        },
      },
    },
    include: { projects: { include: { dataset: true } } },
  });
  const project = workspace.projects[0];
  const dataset = project?.dataset;
  if (!project || !dataset) throw new Error("Fixture project creation failed");

  const version = await prisma.datasetVersion.create({
    data: {
      datasetId: dataset.id,
      versionNumber: 1,
      format: "CSV",
      sourceFileName: "fixture.csv",
      sourceChecksum: contentHash({ fixture: label }),
      contentChecksum: contentHash({ fixture: label, recordCount }),
      recordCount,
      importedById: owner.id,
    },
  });

  const records = [];
  for (let index = 0; index < recordCount; index += 1) {
    records.push(
      await prisma.datasetRecord.create({
        data: {
          datasetVersionId: version.id,
          sourceId: `${label}-record-${index + 1}`,
          sourceOrder: index + 1,
          data: { text: `Fixture record ${index + 1}` },
          contentHash: contentHash({ index }),
        },
      }),
    );
  }
  await prisma.dataset.update({
    where: { id: dataset.id },
    data: { currentVersionId: version.id },
  });

  const schema = await prisma.annotationSchemaVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      schemaJson: schemaJson as never,
      status: "PUBLISHED",
      createdById: owner.id,
      publishedAt: new Date(),
      publishedById: owner.id,
    },
  });

  const tasks = [];
  for (const record of records) {
    tasks.push(
      await prisma.annotationTask.create({
        data: {
          projectId: project.id,
          datasetVersionId: version.id,
          datasetRecordId: record.id,
          schemaVersionId: schema.id,
          requiredAnnotations: required,
          status: "UNASSIGNED",
        },
      }),
    );
  }

  return {
    owner,
    annotator,
    secondAnnotator,
    reviewer,
    outsider,
    workspace,
    project,
    dataset,
    version,
    schema,
    tasks,
    records,
  };
}

export async function assignTask(input: {
  taskId: string;
  userId: string;
  assignedById: string;
  single?: boolean;
  taskStatus?: "ASSIGNED" | "IN_PROGRESS" | "UNASSIGNED";
}) {
  await prisma.taskAssignment.create({
    data: {
      taskId: input.taskId,
      userId: input.userId,
      assignedById: input.assignedById,
      exclusiveSlot: input.single ? input.taskId : null,
    },
  });
  if (input.taskStatus) {
    await prisma.annotationTask.update({
      where: { id: input.taskId },
      data: { status: input.taskStatus },
    });
  }
}
