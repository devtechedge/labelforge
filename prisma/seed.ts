import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Prisma } from "../generated/prisma/client";
import type {
  AnnotationStatus,
  TaskStatus,
} from "../generated/prisma/enums";
import { createPrismaClient } from "../lib/prisma";
import { hashPassword } from "../auth/password";
import { prepareImport } from "../importers";
import { contentHash } from "../domain/canonical";
import { parseAnnotationSchema } from "../domain/schema";
import type { AnnotationAnswer } from "../domain/schema";
import {
  buildManifest,
  buildReleaseSnapshot,
  type SnapshotTaskInput,
} from "../exports/snapshot";

const prisma = createPrismaClient();
const DEMO_PASSWORD = "DemoPass!2026";
const DEMO_SLUGS = ["meridian-review-lab", "northwind-ops"];
const DEMO_EMAILS = [
  "owner@labelforge.demo",
  "manager@labelforge.demo",
  "reviewer@labelforge.demo",
  "maya@labelforge.demo",
  "theo@labelforge.demo",
  "outsider@labelforge.demo",
];
const RESET = process.argv.includes("--reset");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);

function assertSeedAllowed(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const local = LOCAL_HOSTS.has(host);
  if (local) {
    console.log(`Seeding local database at ${host}.`);
    return;
  }
  if (
    process.env.DEMO_DEPLOYMENT !== "true" ||
    process.env.DEMO_ALLOW_PROD_SEED !== "1"
  ) {
    throw new Error(
      "Refusing to seed a non-local database. Set DEMO_DEPLOYMENT=true and DEMO_ALLOW_PROD_SEED=1 only for an isolated demo deployment.",
    );
  }
  if (RESET && process.env.DEMO_ALLOW_RESET !== "1") {
    throw new Error(
      "Refusing to reset a non-local database without DEMO_ALLOW_RESET=1.",
    );
  }
  console.log(`Seeding isolated demo database at ${host}.`);
}

const now = Date.now();
function daysAgo(days: number, hours = 0): Date {
  return new Date(now - days * 86_400_000 - hours * 3_600_000);
}

const productSchema = parseAnnotationSchema({
  kind: "labelforge.annotation-schema",
  version: 1,
  title: "Product review triage",
  instructions:
    "Read the review and label the primary product signal. Choose one category and one sentiment. Severity and notes are optional.",
  fields: [
    {
      key: "category",
      label: "Primary category",
      type: "single_select",
      required: true,
      options: [
        { value: "bug", label: "Bug" },
        { value: "feature_request", label: "Feature request" },
        { value: "usability", label: "Usability" },
        { value: "billing", label: "Billing" },
        { value: "praise", label: "Praise" },
      ],
    },
    {
      key: "sentiment",
      label: "Customer sentiment",
      type: "single_select",
      required: true,
      options: [
        { value: "positive", label: "Positive" },
        { value: "neutral", label: "Neutral" },
        { value: "negative", label: "Negative" },
      ],
    },
    {
      key: "severity",
      label: "Severity",
      type: "single_select",
      required: false,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    {
      key: "notes",
      label: "Reviewer note",
      type: "text",
      required: false,
      maxLength: 500,
    },
  ],
});

const supportSchema = parseAnnotationSchema({
  kind: "labelforge.annotation-schema",
  version: 1,
  title: "Support case quality",
  instructions:
    "Assess the resolution of this support case. Queue and severity describe the case; resolution quality and follow-up describe the outcome.",
  fields: [
    {
      key: "queue",
      label: "Queue",
      type: "single_select",
      required: true,
      options: [
        { value: "billing", label: "Billing" },
        { value: "technical", label: "Technical" },
        { value: "account", label: "Account" },
        { value: "shipping", label: "Shipping" },
      ],
    },
    {
      key: "severity",
      label: "Case severity",
      type: "single_select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    {
      key: "resolution_quality",
      label: "Resolution quality",
      type: "single_select",
      required: true,
      options: [
        { value: "good", label: "Good" },
        { value: "partial", label: "Partial" },
        { value: "unresolved", label: "Unresolved" },
      ],
    },
    {
      key: "follow_up_required",
      label: "Follow-up required",
      type: "boolean",
      required: true,
    },
    {
      key: "signals",
      label: "Signals present",
      type: "multi_select",
      required: false,
      options: [
        { value: "refund", label: "Refund" },
        { value: "escalation", label: "Escalation" },
        { value: "follow_up", label: "Follow-up" },
        { value: "documentation", label: "Documentation" },
      ],
    },
    {
      key: "summary_spans",
      label: "Mark unclear or committed language",
      type: "span",
      required: false,
      sourceField: "summary",
      maxSpans: 5,
      labels: [
        { value: "unclear", label: "Unclear" },
        { value: "commitment", label: "Commitment" },
        { value: "escalation", label: "Escalation" },
      ],
    },
    {
      key: "note",
      label: "Quality note",
      type: "text",
      required: false,
      maxLength: 500,
    },
  ],
});

if (!productSchema.ok) {
  throw new Error("Demo product schema definition is invalid.");
}
if (!supportSchema.ok) {
  throw new Error("Demo support schema definition is invalid.");
}
const productSchemaDefinition = productSchema.schema;
const supportSchemaDefinition = supportSchema.schema;

type BaseAnswer = {
  category: string;
  sentiment: string;
  severity: string;
  notes: string;
};

const reviewAnswers: Record<string, BaseAnswer> = {
  "R-1001": {
    category: "usability",
    sentiment: "negative",
    severity: "medium",
    notes: "Filter state is lost after reopening the app; reproducible on web.",
  },
  "R-1002": {
    category: "billing",
    sentiment: "negative",
    severity: "high",
    notes: "Duplicate annual charge. Support resolved the refund.",
  },
  "R-1003": {
    category: "bug",
    sentiment: "negative",
    severity: "high",
    notes: "Export control hangs without surfacing an error.",
  },
  "R-1004": {
    category: "praise",
    sentiment: "positive",
    severity: "low",
    notes: "Positive feedback on the table view and shortcuts.",
  },
  "R-1005": {
    category: "usability",
    sentiment: "negative",
    severity: "medium",
    notes: "Workspace settings does not explain what gets shared.",
  },
  "R-1006": {
    category: "bug",
    sentiment: "negative",
    severity: "medium",
    notes: "Digest schedule ignores the saved day preference.",
  },
  "R-1007": {
    category: "feature_request",
    sentiment: "neutral",
    severity: "low",
    notes: "Request for saved views shared with a team.",
  },
  "R-1008": {
    category: "praise",
    sentiment: "positive",
    severity: "low",
    notes: "Onboarding checklist reduced a support contact.",
  },
  "R-1009": {
    category: "bug",
    sentiment: "negative",
    severity: "high",
    notes: "Mobile drag gesture opens the card instead of moving it.",
  },
  "R-1010": {
    category: "praise",
    sentiment: "positive",
    severity: "low",
    notes: "Audit log was useful; export requested.",
  },
  "R-1011": {
    category: "feature_request",
    sentiment: "neutral",
    severity: "low",
    notes: "Dark theme request for long editing sessions.",
  },
  "R-1012": {
    category: "bug",
    sentiment: "negative",
    severity: "high",
    notes: "Integration stopped syncing with no visible error.",
  },
};

const reviewOverrides: Record<
  string,
  { theo?: Partial<BaseAnswer> }
> = {
  "R-1003": { theo: { category: "usability", sentiment: "neutral" } },
  "R-1007": { theo: { category: "usability", severity: "medium" } },
  "R-1009": { theo: { category: "usability" } },
};

function answerFor(sourceId: string, who: "maya" | "theo"): AnnotationAnswer {
  const base = reviewAnswers[sourceId];
  if (!base) throw new Error(`No seeded answer for ${sourceId}.`);
  return {
    ...base,
    ...(who === "theo" ? reviewOverrides[sourceId]?.theo ?? {} : {}),
  } as AnnotationAnswer;
}

async function main(): Promise<void> {
  assertSeedAllowed();

  const existing = await prisma.workspace.findFirst({
    where: { slug: { in: DEMO_SLUGS } },
    select: { slug: true },
  });
  const existingUser = await prisma.user.findFirst({
    where: { email: { in: DEMO_EMAILS } },
    select: { email: true },
  });

  if (RESET) {
    console.log("Removing existing demo workspaces and users.");
    await prisma.workspace.deleteMany({ where: { slug: { in: DEMO_SLUGS } } });
    await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
  } else if (existing || existingUser) {
    console.log(
      "Demo data already exists. Run with --reset to remove and recreate it.",
    );
    return;
  }

  const [owner, manager, reviewer, maya, theo, outsider] = await Promise.all(
    [
      ["owner@labelforge.demo", "Anika Rao"],
      ["manager@labelforge.demo", "Jonas Feld"],
      ["reviewer@labelforge.demo", "Priya Sen"],
      ["maya@labelforge.demo", "Maya Okafor"],
      ["theo@labelforge.demo", "Theo Lindt"],
      ["outsider@labelforge.demo", "Samir Vale"],
    ].map(async ([email, displayName]) => {
      return prisma.user.create({
        data: {
          email: email!,
          displayName: displayName!,
          passwordHash: await hashPassword(DEMO_PASSWORD),
          createdAt: daysAgo(10),
        },
      });
    }),
  );

  if (!owner || !manager || !reviewer || !maya || !theo || !outsider) {
    throw new Error("Demo user creation failed.");
  }
  const managerUser = manager;
  const reviewerUser = reviewer;

  const meridian = await prisma.workspace.create({
    data: {
      name: "Meridian Review Lab",
      slug: "meridian-review-lab",
      ownerId: owner.id,
      createdAt: daysAgo(9),
      memberships: {
        create: [
          { userId: owner.id, roles: ["OWNER"], status: "ACTIVE" },
          { userId: manager.id, roles: ["MANAGER"], status: "ACTIVE" },
          { userId: reviewer.id, roles: ["REVIEWER"], status: "ACTIVE" },
          { userId: maya.id, roles: ["ANNOTATOR"], status: "ACTIVE" },
          { userId: theo.id, roles: ["ANNOTATOR"], status: "ACTIVE" },
        ],
      },
    },
  });

  const northwind = await prisma.workspace.create({
    data: {
      name: "Northwind Ops",
      slug: "northwind-ops",
      ownerId: manager.id,
      createdAt: daysAgo(8),
      memberships: {
        create: [
          { userId: manager.id, roles: ["OWNER"], status: "ACTIVE" },
          { userId: reviewer.id, roles: ["REVIEWER"], status: "ACTIVE" },
        ],
      },
    },
  });

  await prisma.invitation.create({
    data: {
      workspaceId: meridian.id,
      email: "dana@labelforge.demo",
      roles: ["REVIEWER"],
      tokenHash: contentHash({ demoInvitation: randomUUID() }),
      status: "PENDING",
      expiresAt: daysAgo(-7),
      inviterId: owner.id,
      createdAt: daysAgo(1),
    },
  });

  const feedbackProject = await prisma.project.create({
    data: {
      workspaceId: meridian.id,
      name: "Product feedback triage",
      description:
        "Triage synthetic product reviews into a reviewed, versioned quality dataset. Seeded for demonstration.",
      annotationMode: "MULTI",
      annotationsPerTask: 2,
      createdById: manager.id,
      createdAt: daysAgo(7),
      dataset: { create: { name: "Product feedback dataset", createdAt: daysAgo(7) } },
    },
    include: { dataset: true },
  });

  const supportProject = await prisma.project.create({
    data: {
      workspaceId: meridian.id,
      name: "Support quality review",
      description:
        "Assess the quality of support resolutions on synthetic cases. Structured, single-annotator workflow.",
      annotationMode: "SINGLE",
      annotationsPerTask: 1,
      createdById: manager.id,
      createdAt: daysAgo(6),
      dataset: { create: { name: "Support cases dataset", createdAt: daysAgo(6) } },
    },
    include: { dataset: true },
  });

  await prisma.project.create({
    data: {
      workspaceId: northwind.id,
      name: "Vendor risk register",
      description: "Isolation demonstration workspace. No dataset has been imported.",
      annotationMode: "SINGLE",
      annotationsPerTask: 1,
      createdById: manager.id,
      createdAt: daysAgo(5),
      dataset: { create: { name: "Vendor register dataset", createdAt: daysAgo(5) } },
    },
  });

  if (!feedbackProject.dataset || !supportProject.dataset) {
    throw new Error("Demo project datasets were not created.");
  }

  const feedbackImport = await importSample({
    workspaceId: meridian.id,
    projectId: feedbackProject.id,
    datasetId: feedbackProject.dataset.id,
    userId: manager.id,
    fileName: "reviews-valid.csv",
    format: "CSV",
    importedAt: daysAgo(4),
  });
  const supportImport = await importSample({
    workspaceId: meridian.id,
    projectId: supportProject.id,
    datasetId: supportProject.dataset.id,
    userId: manager.id,
    fileName: "support-valid.jsonl",
    format: "JSONL",
    importedAt: daysAgo(4),
  });

  const feedbackSchema = await prisma.annotationSchemaVersion.create({
    data: {
      projectId: feedbackProject.id,
      versionNumber: 1,
      schemaJson: productSchemaDefinition as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
      createdById: manager.id,
      createdAt: daysAgo(3, 12),
      publishedAt: daysAgo(3, 11),
      publishedById: owner.id,
    },
  });

  const supportSchemaVersion = await prisma.annotationSchemaVersion.create({
    data: {
      projectId: supportProject.id,
      versionNumber: 1,
      schemaJson: supportSchemaDefinition as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
      createdById: manager.id,
      createdAt: daysAgo(3, 10),
      publishedAt: daysAgo(3, 9),
      publishedById: owner.id,
    },
  });

  const feedbackRecords = await prisma.datasetRecord.findMany({
    where: { datasetVersionId: feedbackImport.versionId },
    orderBy: { sourceOrder: "asc" },
  });
  const supportRecords = await prisma.datasetRecord.findMany({
    where: { datasetVersionId: supportImport.versionId },
    orderBy: { sourceOrder: "asc" },
  });

  await prisma.annotationTask.createMany({
    data: feedbackRecords.map((record) => ({
      projectId: feedbackProject.id,
      datasetVersionId: feedbackImport.versionId,
      datasetRecordId: record.id,
      schemaVersionId: feedbackSchema.id,
      requiredAnnotations: 2,
      status: "UNASSIGNED" as TaskStatus,
      createdAt: daysAgo(3, 8),
    })),
  });
  await prisma.annotationTask.createMany({
    data: supportRecords.map((record) => ({
      projectId: supportProject.id,
      datasetVersionId: supportImport.versionId,
      datasetRecordId: record.id,
      schemaVersionId: supportSchemaVersion.id,
      requiredAnnotations: 1,
      status: "UNASSIGNED" as TaskStatus,
      createdAt: daysAgo(3, 7),
    })),
  });

  const feedbackTasks = await prisma.annotationTask.findMany({
    where: { projectId: feedbackProject.id },
    include: { datasetRecord: true },
  });
  const taskBySource = new Map(
    feedbackTasks.map((task) => [task.datasetRecord.sourceId, task]),
  );
  const task = (sourceId: string) => {
    const value = taskBySource.get(sourceId);
    if (!value) throw new Error(`Missing seeded task ${sourceId}.`);
    return value;
  };

  const supportTasks = await prisma.annotationTask.findMany({
    where: { projectId: supportProject.id },
    include: { datasetRecord: true },
    orderBy: { createdAt: "asc" },
  });
  const supportTaskBySource = new Map(
    supportTasks.map((item) => [item.datasetRecord.sourceId, item]),
  );

  async function assign(
    taskId: string,
    userIds: string[],
    single = false,
  ): Promise<void> {
    await prisma.taskAssignment.createMany({
      data: userIds.map((userId) => ({
        taskId,
        userId,
        assignedById: managerUser.id,
        exclusiveSlot: single ? taskId : null,
        createdAt: daysAgo(2, 10),
      })),
    });
  }

  async function annotate(
    taskId: string,
    annotatorId: string,
    answer: AnnotationAnswer,
    status: AnnotationStatus,
    revision = 3,
  ) {
    return prisma.annotation.create({
      data: {
        taskId,
        annotatorId,
        schemaVersionId: feedbackSchema.id,
        answer: answer as Prisma.InputJsonValue,
        status,
        revision,
        submissionKey:
          status === "DRAFT" ? null : `seed-${taskId}-${annotatorId}`,
        lastSavedAt: daysAgo(2, 8),
        submittedAt: status === "DRAFT" ? null : daysAgo(2, 6),
        createdAt: daysAgo(2, 9),
      },
    });
  }

  function reviewData(input: {
    annotationId: string;
    taskId: string;
    decision: "PASS" | "RETURN_FOR_CORRECTION" | "REJECT" | "REQUEST_ADJUDICATION";
    feedback?: string;
  }) {
    return {
      annotationId: input.annotationId,
      taskId: input.taskId,
      reviewerId: reviewerUser.id,
      decision: input.decision,
      feedback: input.feedback ?? null,
      observedRevision: 3,
      createdAt: daysAgo(1, 4),
    };
  }

  const task1 = task("R-1001");
  await assign(task1.id, [maya.id, theo.id]);
  await annotate(task1.id, maya.id, answerFor("R-1001", "maya"), "DRAFT");
  await prisma.annotationTask.update({
    where: { id: task1.id },
    data: { status: "IN_PROGRESS", version: 4 },
  });

  const task2 = task("R-1002");
  await assign(task2.id, [maya.id, theo.id]);
  await annotate(task2.id, maya.id, answerFor("R-1002", "maya"), "SUBMITTED");
  await annotate(task2.id, theo.id, answerFor("R-1002", "theo"), "SUBMITTED");
  await prisma.annotationTask.update({
    where: { id: task2.id },
    data: { status: "SUBMITTED", version: 5 },
  });

  const task3 = task("R-1003");
  await assign(task3.id, [maya.id, theo.id]);
  const task3Maya = await annotate(
    task3.id,
    maya.id,
    answerFor("R-1003", "maya"),
    "DISPUTED",
  );
  await annotate(task3.id, theo.id, answerFor("R-1003", "theo"), "SUBMITTED");
  await prisma.review.create({
    data: reviewData({
      annotationId: task3Maya.id,
      taskId: task3.id,
      decision: "REQUEST_ADJUDICATION",
      feedback:
        "The category labels conflict. The failure is technically a broken export, but the customer experiences it as a usability dead end. Adjudicate the category.",
    }),
  });
  await prisma.annotationTask.update({
    where: { id: task3.id },
    data: { status: "DISPUTED", version: 7 },
  });

  const task4 = task("R-1004");
  await assign(task4.id, [maya.id, theo.id]);
  const task4Maya = await annotate(
    task4.id,
    maya.id,
    answerFor("R-1004", "maya"),
    "ACCEPTED",
  );
  const task4Theo = await annotate(
    task4.id,
    theo.id,
    answerFor("R-1004", "theo"),
    "ACCEPTED",
  );
  await prisma.review.createMany({
    data: [
      reviewData({
        annotationId: task4Maya.id,
        taskId: task4.id,
        decision: "PASS",
        feedback: "Labels match the review and the note is specific.",
      }),
      reviewData({
        annotationId: task4Theo.id,
        taskId: task4.id,
        decision: "PASS",
      }),
    ],
  });
  await prisma.annotationTask.update({
    where: { id: task4.id },
    data: { status: "ACCEPTED", version: 9 },
  });

  const task5 = task("R-1005");
  await assign(task5.id, [maya.id, theo.id]);
  const task5Maya = await annotate(
    task5.id,
    maya.id,
    answerFor("R-1005", "maya"),
    "RETURNED_FOR_CORRECTION",
  );
  await annotate(task5.id, theo.id, answerFor("R-1005", "theo"), "SUBMITTED");
  await prisma.review.create({
    data: reviewData({
      annotationId: task5Maya.id,
      taskId: task5.id,
      decision: "RETURN_FOR_CORRECTION",
      feedback:
        "Please name the specific setting that is missing instead of saying the page is confusing. Then resubmit for review.",
    }),
  });
  await prisma.annotationTask.update({
    where: { id: task5.id },
    data: { status: "RETURNED_FOR_CORRECTION", version: 7 },
  });

  for (const sourceId of ["R-1006", "R-1008", "R-1010"]) {
    const item = task(sourceId);
    await assign(item.id, [maya.id, theo.id]);
    await annotate(item.id, maya.id, answerFor(sourceId, "maya"), "SUBMITTED");
    await annotate(item.id, theo.id, answerFor(sourceId, "theo"), "SUBMITTED");
    await prisma.annotationTask.update({
      where: { id: item.id },
      data: { status: "SUBMITTED", version: 5 },
    });
  }

  const task9 = task("R-1009");
  await assign(task9.id, [maya.id, theo.id]);
  await annotate(task9.id, maya.id, answerFor("R-1009", "maya"), "SUBMITTED");
  await annotate(task9.id, theo.id, answerFor("R-1009", "theo"), "SUBMITTED");
  await prisma.annotationTask.update({
    where: { id: task9.id },
    data: { status: "SUBMITTED", version: 5 },
  });

  const task7 = task("R-1007");
  await assign(task7.id, [maya.id, theo.id]);
  const task7Maya = await annotate(
    task7.id,
    maya.id,
    answerFor("R-1007", "maya"),
    "SUBMITTED",
  );
  const task7Theo = await annotate(
    task7.id,
    theo.id,
    answerFor("R-1007", "theo"),
    "DISPUTED",
  );
  await prisma.review.create({
    data: reviewData({
      annotationId: task7Theo.id,
      taskId: task7.id,
      decision: "REQUEST_ADJUDICATION",
      feedback:
        "One annotator reads this as a new capability, the other as a navigation defect. The request is for a new saved-view capability, but adjudicate with the product context.",
    }),
  });
  await prisma.annotationTask.update({
    where: { id: task7.id },
    data: { status: "DISPUTED", version: 8 },
  });
  await prisma.adjudication.create({
    data: {
      taskId: task7.id,
      adjudicatorId: owner.id,
      schemaVersionId: feedbackSchema.id,
      finalAnswer: {
        category: "feature_request",
        sentiment: "neutral",
        severity: "medium",
        notes: "Saved shared views are a new capability, not a defect. Confirmed with the product roadmap.",
      },
      rationale:
        "The record asks to persist and share a filtered view. That is a new capability, so feature request is the correct category. Severity is medium because teams currently copy filter settings by hand.",
      chosenAnnotationId: task7Maya.id,
      expectedTaskVersion: 8,
      createdAt: daysAgo(0, 6),
    },
  });
  await prisma.annotationTask.update({
    where: { id: task7.id },
    data: { status: "RESOLVED", version: 9 },
  });

  const task11 = task("R-1011");
  await assign(task11.id, [maya.id]);
  await prisma.annotationTask.update({
    where: { id: task11.id },
    data: { status: "ASSIGNED", version: 1 },
  });

  const supportTask5 = supportTaskBySource.get("C-9005");
  const supportTask6 = supportTaskBySource.get("C-9006");
  const supportTask7 = supportTaskBySource.get("C-9007");
  const supportTask8 = supportTaskBySource.get("C-9008");
  if (!supportTask5 || !supportTask6 || !supportTask7 || !supportTask8) {
    throw new Error("Seeded support tasks are missing.");
  }

  await assign(supportTask5.id, [maya.id], true);
  await prisma.annotationTask.update({
    where: { id: supportTask5.id },
    data: { status: "ASSIGNED", version: 1 },
  });
  await assign(supportTask6.id, [maya.id], true);
  await prisma.annotation.create({
    data: {
      taskId: supportTask6.id,
      annotatorId: maya.id,
      schemaVersionId: supportSchemaVersion.id,
      answer: {
        queue: "technical",
        severity: "high",
        resolution_quality: "partial",
        follow_up_required: true,
        signals: ["follow_up", "escalation"],
        note: "The fix is described, but the customer was not told when retries stop.",
      },
      status: "DRAFT",
      revision: 2,
      lastSavedAt: daysAgo(1, 2),
      createdAt: daysAgo(1, 3),
    },
  });
  await prisma.annotationTask.update({
    where: { id: supportTask6.id },
    data: { status: "IN_PROGRESS", version: 3 },
  });
  await assign(supportTask7.id, [theo.id], true);
  await prisma.annotation.create({
    data: {
      taskId: supportTask7.id,
      annotatorId: theo.id,
      schemaVersionId: supportSchemaVersion.id,
      answer: {
        queue: "account",
        severity: "low",
        resolution_quality: "good",
        follow_up_required: false,
        signals: ["documentation"],
        summary_spans: [
          {
            start: 0,
            end: 10,
            label: "unclear",
            quote: "Seat count",
          },
        ],
        note: "Seat sync was rerun and the purchased quantity was confirmed.",
      },
      status: "SUBMITTED",
      revision: 3,
      submissionKey: `seed-${supportTask7.id}-${theo.id}`,
      lastSavedAt: daysAgo(1, 1),
      submittedAt: daysAgo(1),
      createdAt: daysAgo(1, 2),
    },
  });
  await prisma.annotationTask.update({
    where: { id: supportTask7.id },
    data: { status: "SUBMITTED", version: 4 },
  });
  await assign(supportTask8.id, [theo.id], true);
  await prisma.annotationTask.update({
    where: { id: supportTask8.id },
    data: { status: "ASSIGNED", version: 1 },
  });

  const allFeedbackTasks = await prisma.annotationTask.findMany({
    where: { projectId: feedbackProject.id },
    include: {
      datasetRecord: true,
      annotations: { where: { status: { not: "DRAFT" } } },
      adjudications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const snapshotInputs: SnapshotTaskInput[] = allFeedbackTasks
    .sort((a, b) => a.datasetRecord.sourceOrder - b.datasetRecord.sourceOrder)
    .map((item) => ({
      taskId: item.id,
      status: item.status,
      requiredAnnotations: item.requiredAnnotations,
      datasetRecordId: item.datasetRecordId,
      sourceId: item.datasetRecord.sourceId,
      sourceOrder: item.datasetRecord.sourceOrder,
      data: item.datasetRecord.data as never,
      schemaVersionId: item.schemaVersionId,
      annotations: item.annotations.map((annotation) => ({
        id: annotation.id,
        status: annotation.status,
        answer: annotation.answer as never,
        revision: annotation.revision,
      })),
      adjudication: item.adjudications[0]
        ? {
            id: item.adjudications[0].id,
            finalAnswer: item.adjudications[0].finalAnswer as never,
            chosenAnnotationId: item.adjudications[0].chosenAnnotationId,
            rationale: item.adjudications[0].rationale,
            createdAt: item.adjudications[0].createdAt,
          }
        : null,
    }));

  const snapshot = buildReleaseSnapshot(snapshotInputs);
  const releaseDate = daysAgo(0, 2);
  const manifest = buildManifest({
    releaseVersion: 1,
    createdAt: releaseDate,
    project: { id: feedbackProject.id, name: feedbackProject.name },
    dataset: {
      versionId: feedbackImport.versionId,
      versionNumber: feedbackImport.versionNumber,
      format: "CSV",
      sourceChecksum: feedbackImport.sourceChecksum,
    },
    schema: {
      versionId: feedbackSchema.id,
      versionNumber: 1,
      schema: productSchemaDefinition,
    },
    snapshot,
    sourceTaskCount: allFeedbackTasks.length,
    notes: "Seeded demonstration release. Two finalized records; unresolved work is excluded.",
  });

  const release = await prisma.datasetRelease.create({
    data: {
      projectId: feedbackProject.id,
      versionNumber: 1,
      datasetVersionId: feedbackImport.versionId,
      schemaVersionId: feedbackSchema.id,
      selectionPolicy: manifest.selectionPolicy,
      recordCount: snapshot.recordCount,
      annotationCount: snapshot.annotationCount,
      excludedCount: snapshot.excludedCount,
      checksum: snapshot.checksums.jsonlSha256,
      csvChecksum: snapshot.checksums.csvSha256,
      manifest: manifest as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
      createdById: owner.id,
      createdAt: releaseDate,
      publishedAt: releaseDate,
    },
  });

  const recordIdByTask = new Map(
    snapshotInputs.map((item) => [item.taskId, item.datasetRecordId]),
  );
  await prisma.releaseItem.createMany({
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

  await prisma.auditEvent.createMany({
    data: [
      {
        workspaceId: meridian.id,
        actorId: owner.id,
        action: "workspace.created",
        targetType: "Workspace",
        targetId: meridian.id,
        metadata: { name: meridian.name },
        createdAt: daysAgo(9),
      },
      {
        workspaceId: meridian.id,
        actorId: manager.id,
        action: "project.created",
        targetType: "Project",
        targetId: feedbackProject.id,
        metadata: { name: feedbackProject.name },
        createdAt: daysAgo(7),
      },
      {
        workspaceId: meridian.id,
        actorId: manager.id,
        action: "import.committed",
        targetType: "DatasetVersion",
        targetId: feedbackImport.versionId,
        metadata: { recordCount: 12, format: "CSV" },
        createdAt: daysAgo(4),
      },
      {
        workspaceId: meridian.id,
        actorId: owner.id,
        action: "schema.published",
        targetType: "AnnotationSchemaVersion",
        targetId: feedbackSchema.id,
        metadata: { versionNumber: 1 },
        createdAt: daysAgo(3, 11),
      },
      {
        workspaceId: meridian.id,
        actorId: manager.id,
        action: "tasks.generated",
        targetType: "AnnotationTask",
        targetId: feedbackSchema.id,
        metadata: { created: 12, schemaVersionId: feedbackSchema.id },
        createdAt: daysAgo(3, 8),
      },
      {
        workspaceId: meridian.id,
        actorId: manager.id,
        action: "tasks.assigned",
        targetType: "AnnotationTask",
        targetId: feedbackProject.id,
        metadata: { taskCount: 11, assigneeCount: 2 },
        createdAt: daysAgo(2, 10),
      },
      {
        workspaceId: meridian.id,
        actorId: reviewer.id,
        action: "review.decided",
        targetType: "AnnotationTask",
        targetId: task4.id,
        metadata: { decision: "PASS", resultingStatus: "ACCEPTED" },
        createdAt: daysAgo(1, 4),
      },
      {
        workspaceId: meridian.id,
        actorId: reviewer.id,
        action: "review.requested_adjudication",
        targetType: "AnnotationTask",
        targetId: task3.id,
        metadata: { decision: "REQUEST_ADJUDICATION" },
        createdAt: daysAgo(1, 4),
      },
      {
        workspaceId: meridian.id,
        actorId: owner.id,
        action: "adjudication.completed",
        targetType: "AnnotationTask",
        targetId: task7.id,
        metadata: { projectId: feedbackProject.id },
        createdAt: daysAgo(0, 6),
      },
      {
        workspaceId: meridian.id,
        actorId: owner.id,
        action: "release.published",
        targetType: "DatasetRelease",
        targetId: release.id,
        metadata: {
          projectId: feedbackProject.id,
          recordCount: snapshot.recordCount,
          checksum: snapshot.checksums.jsonlSha256,
        },
        createdAt: releaseDate,
      },
      {
        workspaceId: northwind.id,
        actorId: manager.id,
        action: "workspace.created",
        targetType: "Workspace",
        targetId: northwind.id,
        metadata: { name: northwind.name },
        createdAt: daysAgo(8),
      },
    ],
  });

  console.log(
    [
      "Demo seed complete.",
      `Workspace: ${meridian.name} (${meridian.slug})`,
      `Project: ${feedbackProject.name}`,
      `Project: ${supportProject.name}`,
      `Release v1: ${snapshot.recordCount} records, ${snapshot.excludedCount} excluded`,
      `Demo password: ${DEMO_PASSWORD}`,
      "Accounts: owner@labelforge.demo, manager@labelforge.demo, reviewer@labelforge.demo, maya@labelforge.demo, theo@labelforge.demo, outsider@labelforge.demo",
    ].join("\n"),
  );
}

async function importSample(input: {
  workspaceId: string;
  projectId: string;
  datasetId: string;
  userId: string;
  fileName: string;
  format: "CSV" | "JSONL";
  importedAt: Date;
}) {
  const bytes = readFileSync(
    path.join(process.cwd(), "public", "samples", input.fileName),
  );
  const prepared = prepareImport({
    bytes,
    fileName: input.fileName,
    format: input.format,
    options: { delimiter: "," },
  });
  if (!prepared.ok) {
    throw new Error(`Seed sample failed validation: ${prepared.message}`);
  }
  const rows = prepared.result.rows.filter((row) => row.valid);
  const contentChecksum = contentHash(
    rows.map((row) => ({
      sourceId: row.sourceId,
      sourceOrder: row.rowNumber,
      data: row.data,
    })),
  );
  const existingVersions = await prisma.datasetVersion.count({
    where: { datasetId: input.datasetId },
  });
  const version = await prisma.datasetVersion.create({
    data: {
      datasetId: input.datasetId,
      versionNumber: existingVersions + 1,
      format: input.format,
      sourceFileName: prepared.result.fileName,
      sourceChecksum: prepared.result.sourceChecksum,
      contentChecksum,
      recordCount: rows.length,
      importedById: input.userId,
      createdAt: input.importedAt,
    },
  });
  await prisma.datasetRecord.createMany({
    data: rows.map((row) => ({
      datasetVersionId: version.id,
      sourceId: row.sourceId ?? `row-${row.rowNumber}`,
      sourceOrder: row.rowNumber,
      data: (row.data ?? {}) as Prisma.InputJsonValue,
      contentHash: contentHash({ sourceId: row.sourceId, data: row.data }),
    })),
  });
  await prisma.dataset.update({
    where: { id: input.datasetId },
    data: { currentVersionId: version.id },
  });
  await prisma.importBatch.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      createdById: input.userId,
      fileName: prepared.result.fileName,
      format: input.format,
      sourceChecksum: prepared.result.sourceChecksum,
      byteSize: prepared.result.byteSize,
      status: "COMMITTED",
      parseOptions: { delimiter: "," },
      totalRows: prepared.result.totalRows,
      validRows: prepared.result.validRows,
      invalidRows: prepared.result.invalidRows,
      duplicateRows: prepared.result.duplicateRows,
      normalizationNotes: prepared.result.notes,
      expiresAt: new Date(input.importedAt.getTime() + 3_600_000),
      committedAt: input.importedAt,
      committedVersionId: version.id,
      createdAt: input.importedAt,
    },
  });
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    sourceChecksum: prepared.result.sourceChecksum,
    rows,
  };
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
