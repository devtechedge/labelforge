import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  saveDraft,
  submitAnnotation,
} from "@/services/tasks";
import {
  adjudicateTask,
  beginAdjudication,
  reviewAnnotation,
} from "@/services/review";
import {
  applySchemaToUnstartedTasks,
  createSchemaVersion,
  publishSchemaVersion,
} from "@/services/schemas";
import {
  assignTask,
  createScenario,
  resetDatabase,
  schemaJson,
} from "./helpers";

describe("annotation and review workflow", () => {
  beforeEach(resetDatabase);

  it("persists drafts, rejects stale revisions, and makes submission idempotent", async () => {
    const scenario = await createScenario({ label: "draft-flow" });
    const taskId = scenario.tasks[0]!.id;
    await assignTask({
      taskId,
      userId: scenario.annotator.id,
      assignedById: scenario.owner.id,
      single: true,
      taskStatus: "ASSIGNED",
    });

    const first = await saveDraft({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      answer: { category: "a" },
      expectedRevision: 0,
    });
    expect(first.revision).toBe(1);

    await expect(
      saveDraft({
        user: scenario.annotator,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        answer: { category: "b" },
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const second = await saveDraft({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      answer: { category: "b" },
      expectedRevision: 1,
    });
    expect(second.revision).toBe(2);

    const submission = await submitAnnotation({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      expectedRevision: 2,
      submissionKey: "submission-one",
    });
    expect(submission.idempotent).toBe(false);
    expect(submission.taskStatus).toBe("SUBMITTED");

    const duplicate = await submitAnnotation({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      expectedRevision: 2,
      submissionKey: "submission-one",
    });
    expect(duplicate.idempotent).toBe(true);
    expect(
      await prisma.annotation.count({ where: { taskId } }),
    ).toBe(1);
  });

  it("supports accept, return, and a correct resubmission", async () => {
    const scenario = await createScenario({ label: "review-flow" });
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
      submissionKey: "review-key",
    });
    const annotation = await prisma.annotation.findFirstOrThrow({ where: { taskId } });

    const returned = await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotation.id,
      decision: "RETURN_FOR_CORRECTION",
      feedback: "Please add a clearer explanation in the note field.",
      expectedRevision: annotation.revision,
      idempotencyKey: "review-return",
    });
    expect(returned.annotationStatus).toBe("RETURNED_FOR_CORRECTION");
    expect(returned.taskStatus).toBe("RETURNED_FOR_CORRECTION");

    const edited = await saveDraft({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      answer: { category: "b", note: "More evidence." },
      expectedRevision: annotation.revision,
    });
    expect(edited.status).toBe("RETURNED_FOR_CORRECTION");
    const resubmitted = await submitAnnotation({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      expectedRevision: edited.revision,
      submissionKey: "review-key-2",
    });
    expect(resubmitted.taskStatus).toBe("SUBMITTED");

    const accepted = await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotation.id,
      decision: "PASS",
      expectedRevision: resubmitted.revision,
      idempotencyKey: "review-pass",
    });
    expect(accepted.annotationStatus).toBe("ACCEPTED");
    expect(accepted.taskStatus).toBe("ACCEPTED");
  });

  it("prevents self-review and stale decisions", async () => {
    const scenario = await createScenario({ label: "self-review" });
    await prisma.membership.updateMany({
      where: { workspaceId: scenario.workspace.id, userId: scenario.annotator.id },
      data: { roles: ["ANNOTATOR", "REVIEWER"] },
    });
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
      submissionKey: "self-review",
    });
    const annotation = await prisma.annotation.findFirstOrThrow({ where: { taskId } });
    await expect(
      reviewAnnotation({
        user: scenario.annotator,
        annotationId: annotation.id,
        decision: "PASS",
        expectedRevision: annotation.revision,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("finishes a mixed accepted and rejected task as REJECTED", async () => {
    const scenario = await createScenario({
      mode: "MULTI",
      required: 2,
      label: "mixed-final",
    });
    const taskId = scenario.tasks[0]!.id;
    for (const user of [scenario.annotator, scenario.secondAnnotator]) {
      await assignTask({
        taskId,
        userId: user.id,
        assignedById: scenario.owner.id,
        taskStatus: "ASSIGNED",
      });
      await saveDraft({
        user,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        answer: { category: "a" },
        expectedRevision: 0,
      });
      await submitAnnotation({
        user,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        expectedRevision: 1,
        submissionKey: `mixed-${user.id}`,
      });
    }
    const annotations = await prisma.annotation.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotations[0]!.id,
      decision: "PASS",
      expectedRevision: annotations[0]!.revision,
    });
    const afterFirst = await prisma.annotationTask.findUniqueOrThrow({
      where: { id: taskId },
    });
    expect(afterFirst.status).toBe("IN_REVIEW");
    const result = await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotations[1]!.id,
      decision: "REJECT",
      feedback: "The answer contradicts the source record. Reject this submission.",
      expectedRevision: annotations[1]!.revision,
    });
    expect(result.taskStatus).toBe("REJECTED");
  });

  it("requires ADJUDICATION before resolving a dispute", async () => {
    const scenario = await createScenario({
      mode: "MULTI",
      required: 2,
      label: "adjudication",
    });
    const taskId = scenario.tasks[0]!.id;
    for (const user of [scenario.annotator, scenario.secondAnnotator]) {
      await assignTask({
        taskId,
        userId: user.id,
        assignedById: scenario.owner.id,
        taskStatus: "ASSIGNED",
      });
      await saveDraft({
        user,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        answer: { category: user.id === scenario.annotator.id ? "a" : "b" },
        expectedRevision: 0,
      });
      await submitAnnotation({
        user,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        expectedRevision: 1,
        submissionKey: `adjudication-${user.id}`,
      });
    }
    const annotations = await prisma.annotation.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    await reviewAnnotation({
      user: scenario.reviewer,
      annotationId: annotations[0]!.id,
      decision: "REQUEST_ADJUDICATION",
      feedback: "The annotators disagree on the category. Resolve with evidence.",
      expectedRevision: annotations[0]!.revision,
    });
    const disputed = await prisma.annotationTask.findUniqueOrThrow({
      where: { id: taskId },
    });
    expect(disputed.status).toBe("DISPUTED");

    await expect(
      adjudicateTask({
        user: scenario.owner,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        finalAnswer: { category: "a" },
        rationale: "The source record supports the first category after review.",
        expectedTaskVersion: disputed.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const begun = await beginAdjudication({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
    });
    expect(begun.status).toBe("ADJUDICATION");

    const resolved = await adjudicateTask({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId,
      finalAnswer: { category: "a" },
      rationale: "The source record supports the first category after review.",
      expectedTaskVersion: begun.version,
      chosenAnnotationId: annotations[0]!.id,
    });
    expect(resolved.taskStatus).toBe("RESOLVED");
    expect(await prisma.adjudication.count({ where: { taskId } })).toBe(1);
  });


  it("accepts only one of two simultaneous draft creates", async () => {
    const scenario = await createScenario({ label: "concurrent-draft" });
    const taskId = scenario.tasks[0]!.id;
    await assignTask({
      taskId,
      userId: scenario.annotator.id,
      assignedById: scenario.owner.id,
      single: true,
      taskStatus: "ASSIGNED",
    });
    const results = await Promise.allSettled([
      saveDraft({
        user: scenario.annotator,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        answer: { category: "a" },
        expectedRevision: 0,
      }),
      saveDraft({
        user: scenario.annotator,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId,
        answer: { category: "b" },
        expectedRevision: 0,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = rejected[0] as PromiseRejectedResult;
    expect(reason.reason).toMatchObject({ code: "CONFLICT" });
    expect(await prisma.annotation.count({ where: { taskId } })).toBe(1);
  });

  it("rejects a reviewer using a revision different from the one shown", async () => {
    const scenario = await createScenario({ label: "stale-review" });
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
      submissionKey: "stale-review-key",
    });
    const annotation = await prisma.annotation.findFirstOrThrow({ where: { taskId } });
    await expect(
      reviewAnnotation({
        user: scenario.reviewer,
        annotationId: annotation.id,
        decision: "PASS",
        expectedRevision: annotation.revision - 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await prisma.annotation.findUniqueOrThrow({ where: { id: annotation.id } }))
        .status,
    ).toBe("SUBMITTED");
  });

  it("pins existing tasks to their schema through unstarted-only migration", async () => {
    const scenario = await createScenario({
      recordCount: 2,
      label: "schema-pin",
    });
    const schema2 = await createSchemaVersion({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schema: { ...schemaJson, title: "Integration schema v2" },
    });
    await publishSchemaVersion({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: schema2.id,
    });

    const [startedTask, unstartedTask] = scenario.tasks;
    await assignTask({
      taskId: startedTask!.id,
      userId: scenario.annotator.id,
      assignedById: scenario.owner.id,
      single: true,
      taskStatus: "ASSIGNED",
    });
    await saveDraft({
      user: scenario.annotator,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      taskId: startedTask!.id,
      answer: { category: "a" },
      expectedRevision: 0,
    });

    const result = await applySchemaToUnstartedTasks({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      schemaVersionId: schema2.id,
    });
    expect(result.updated).toBe(1);

    const pinned = await prisma.annotationTask.findUniqueOrThrow({
      where: { id: startedTask!.id },
    });
    const moved = await prisma.annotationTask.findUniqueOrThrow({
      where: { id: unstartedTask!.id },
    });
    expect(pinned.schemaVersionId).toBe(scenario.schema.id);
    expect(moved.schemaVersionId).toBe(schema2.id);
  });
});
