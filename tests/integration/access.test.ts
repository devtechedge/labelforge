import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { getProjectAccess, getTaskAccess } from "@/repositories/access";
import { getWorkspaceAccess } from "@/auth/session";
import { saveDraft } from "@/services/tasks";
import { createImportPreview, getImportBatch } from "@/services/imports";
import { createScenario, resetDatabase } from "./helpers";

const encoder = new TextEncoder();

describe("tenant isolation", () => {
  beforeEach(resetDatabase);

  it("returns no access to a project or workspace from another tenant", async () => {
    const first = await createScenario({ label: "tenant-a" });
    const second = await createScenario({ label: "tenant-b" });

    expect(
      await getProjectAccess(first.owner, first.workspace.id, first.project.id),
    ).not.toBeNull();
    expect(
      await getProjectAccess(second.owner, first.workspace.id, first.project.id),
    ).toBeNull();
    expect(
      await getProjectAccess(second.owner, second.workspace.id, first.project.id),
    ).toBeNull();
    expect(
      await getTaskAccess(
        second.owner,
        first.workspace.id,
        first.project.id,
        first.tasks[0]!.id,
      ),
    ).toBeNull();
    expect(await getWorkspaceAccess(first.workspace.id, second.owner)).toBeNull();
  });

  it("blocks an outsider from saving a draft even with a valid task id", async () => {
    const scenario = await createScenario({ label: "save-isolation" });
    await expect(
      saveDraft({
        user: scenario.outsider,
        workspaceId: scenario.workspace.id,
        projectId: scenario.project.id,
        taskId: scenario.tasks[0]!.id,
        answer: { category: "a" },
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks an outsider from reading a valid import batch", async () => {
    const scenario = await createScenario({ label: "batch-isolation" });
    const batch = await createImportPreview({
      user: scenario.owner,
      workspaceId: scenario.workspace.id,
      projectId: scenario.project.id,
      roles: ["OWNER"],
      fileName: "data.csv",
      bytes: encoder.encode("id,text\n1,one\n"),
    });
    await expect(
      getImportBatch(scenario.outsider, batch.id, scenario.workspace.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.importBatch.count()).toBe(1);
  });
});
