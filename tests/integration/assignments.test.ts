import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { assignTasks, reassignTasks, saveDraft } from "@/services/tasks";
import {
  addMember,
  assignTask,
  createScenario,
  createUser,
  resetDatabase,
} from "./helpers";

describe("assignment rules", () => {
  beforeEach(resetDatabase);

  it("enforces multi-annotator capacity and rejects duplicates", async () => {
    const scenario = await createScenario({
      mode: "MULTI",
      required: 2,
      label: "multi-assign",
    });
    const taskId = scenario.tasks[0]!.id;
    const result = await assignTasks({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      taskIds: [taskId],
      userIds: [scenario.annotator.id, scenario.secondAnnotator.id],
    });
    expect(result.assignments).toBe(2);

    const task = await prisma.annotationTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { assignments: true },
    });
    expect(task.status).toBe("ASSIGNED");
    expect(task.assignments).toHaveLength(2);

    await expect(
      assignTasks({
        user: scenario.owner,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        roles: ["OWNER"],
        taskIds: [taskId],
        userIds: [scenario.annotator.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const third = await createUser("third-annotator");
    await addMember(scenario.workspace.id, third.id, ["ANNOTATOR"]);
    await expect(
      assignTasks({
        user: scenario.owner,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        roles: ["OWNER"],
        taskIds: [taskId],
        userIds: [third.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an assignee without the Annotator role", async () => {
    const scenario = await createScenario({ label: "role-assign" });
    await expect(
      assignTasks({
        user: scenario.owner,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        roles: ["OWNER"],
        taskIds: [scenario.tasks[0]!.id],
        userIds: [scenario.reviewer.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces one active assignment in single mode", async () => {
    const scenario = await createScenario({ label: "single-assign" });
    const taskId = scenario.tasks[0]!.id;
    await assignTasks({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      taskIds: [taskId],
      userIds: [scenario.annotator.id],
    });
    await expect(
      assignTasks({
        user: scenario.owner,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        roles: ["OWNER"],
        taskIds: [taskId],
        userIds: [scenario.secondAnnotator.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reassigns without erasing the prior draft", async () => {
    const scenario = await createScenario({ label: "reassign" });
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

    const result = await reassignTasks({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      taskIds: [taskId],
      userId: scenario.secondAnnotator.id,
    });
    expect(result.reassigned).toBe(1);

    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    expect(assignments.map((assignment) => assignment.status)).toEqual([
      "RELEASED",
      "ACTIVE",
    ]);
    expect(assignments[0]?.exclusiveSlot).toBeNull();
    expect(await prisma.annotation.count({ where: { taskId } })).toBe(1);
  });
});
