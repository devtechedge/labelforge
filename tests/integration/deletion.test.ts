import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { saveDraft, submitAnnotation } from "@/services/tasks";
import { reviewAnnotation } from "@/services/review";
import { publishRelease } from "@/services/releases";
import { createImportPreview } from "@/services/imports";
import { deleteWorkspace } from "@/services/workspaces";
import { assignTask, createScenario, resetDatabase } from "./helpers";

describe("permanent deletion", () => {
  beforeEach(resetDatabase);

  it("cascades workspace content without deleting the user account", async () => {
    const scenario = await createScenario({ label: "delete" });
    const taskId = scenario.tasks[0]!.id;
    await assignTask({
      taskId,
      userId: scenario.annotator.id,
      assignedById: scenario.owner.id,
      single: true,
      taskStatus: "ASSIGNED",
    });
    await saveDraft({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      answer: { category: "a" },
      expectedRevision: 0,
    });
    await submitAnnotation({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      expectedRevision: 1,
      submissionKey: "delete-release",
    });
    const annotation = await prisma.annotation.findFirstOrThrow({ where: { taskId } });
    await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotation.id,
      decision: "PASS",
      expectedRevision: annotation.revision,
    });
    await publishRelease({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: scenario.schema.id,
      datasetVersionId: scenario.version.id,
    });
    await createImportPreview({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      fileName: "pending.csv",
      bytes: new TextEncoder().encode("id,text\n1,pending\n"),
    });

    await deleteWorkspace({
      workspaceId: scenario.workspace.id,
      confirmation: scenario.workspace.slug,
      actorId: scenario.owner.id,
      rolesOfActor: ["OWNER"],
    });

    const [
      workspaces,
      projects,
      datasets,
      versions,
      records,
      schemas,
      tasks,
      annotations,
      reviews,
      releases,
      releaseItems,
      batches,
      audits,
      users,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.project.count(),
      prisma.dataset.count(),
      prisma.datasetVersion.count(),
      prisma.datasetRecord.count(),
      prisma.annotationSchemaVersion.count(),
      prisma.annotationTask.count(),
      prisma.annotation.count(),
      prisma.review.count(),
      prisma.datasetRelease.count(),
      prisma.releaseItem.count(),
      prisma.importBatch.count(),
      prisma.auditEvent.count(),
      prisma.user.count(),
    ]);

    expect([
      workspaces,
      projects,
      datasets,
      versions,
      records,
      schemas,
      tasks,
      annotations,
      reviews,
      releases,
      releaseItems,
      batches,
      audits,
    ]).toEqual(Array(13).fill(0));
    expect(users).toBe(5);
    expect(
      await prisma.user.findUnique({ where: { id: scenario.owner.id } }),
    ).not.toBeNull();
  });
});
