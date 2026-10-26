import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  saveDraft,
  submitAnnotation,
} from "@/services/tasks";
import { reviewAnnotation } from "@/services/review";
import {
  getReleaseExport,
  publishRelease,
  verifyReleaseIntegrity,
} from "@/services/releases";
import {
  assignTask,
  createScenario,
  resetDatabase,
} from "./helpers";

async function makeAcceptedTask(label: string) {
  const scenario = await createScenario({ recordCount: 2, label });
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
    submissionKey: `release-${label}`,
  });
  const annotation = await prisma.annotation.findFirstOrThrow({ where: { taskId } });
  await reviewAnnotation({
    user: scenario.reviewer,
    annotationId: annotation.id,
    decision: "PASS",
    expectedRevision: annotation.revision,
  });
  return { scenario, taskId, annotation };
}

describe("release immutability", () => {
  beforeEach(resetDatabase);

  it("publishes, verifies, and re-downloads identical bytes", async () => {
    const { scenario } = await makeAcceptedTask("release");
    const first = await publishRelease({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: scenario.schema.id,
      datasetVersionId: scenario.version.id,
    });
    expect(first.recordCount).toBe(1);
    expect(first.excludedCount).toBe(1);

    const exported = await getReleaseExport(scenario.owner, first.releaseId);
    const verified = verifyReleaseIntegrity(exported.release, exported.items);
    expect(verified.jsonl).toContain('"sourceId":"release-record-1"');
    expect(exported.items).toHaveLength(1);
    expect(exported.release.checksum).toBe(first.checksum);

    const second = await publishRelease({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: scenario.schema.id,
      datasetVersionId: scenario.version.id,
    });
    expect(second.versionNumber).toBe(2);
    expect(second.checksum).toBe(first.checksum);

    const firstAgain = await getReleaseExport(scenario.owner, first.releaseId);
    expect(firstAgain.release.items[0]?.answer).toEqual({ category: "a" });
  });

  it("never mutates a release when source answers change", async () => {
    const { scenario, annotation } = await makeAcceptedTask("immutable");
    const release = await publishRelease({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: scenario.schema.id,
      datasetVersionId: scenario.version.id,
    });
    await prisma.annotation.update({
      where: { id: annotation.id },
      data: { answer: { category: "b" } },
    });
    const exported = await getReleaseExport(scenario.owner, release.releaseId);
    expect(exported.release.items[0]?.answer).toEqual({ category: "a" });
    expect(() =>
      verifyReleaseIntegrity(exported.release, exported.items),
    ).not.toThrow();
  });

  it("denies release export to an outsider", async () => {
    const { scenario } = await makeAcceptedTask("release-access");
    const release = await publishRelease({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: scenario.schema.id,
      datasetVersionId: scenario.version.id,
    });
    await expect(
      getReleaseExport(scenario.outsider, release.releaseId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
