import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { commitImport, createImportPreview, getImportBatch } from "@/services/imports";
import { cleanupStaleData } from "@/services/maintenance";
import { addMember, createEmptyProject, createUser, resetDatabase } from "./helpers";

const encoder = new TextEncoder();
const roles = ["OWNER"] as const;

function csv(text: string): Uint8Array {
  return encoder.encode(text);
}

describe("import preview and commit", () => {
  beforeEach(resetDatabase);

  it("previews real bytes, quarantines duplicates, and commits valid rows", async () => {
    const fixture = await createEmptyProject("imports");
    const batch = await createImportPreview({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      fileName: "reviews.csv",
      bytes: csv("review_id,text\nR-1,one\nR-2,two\nR-1,duplicate\n"),
    });

    expect(batch.totalRows).toBe(3);
    expect(batch.validRows).toBe(2);
    expect(batch.invalidRows).toBe(1);
    expect(batch.duplicateRows).toBe(1);
    expect(batch.errors[0]?.code).toBe("DUPLICATE_ID");

    const committed = await commitImport({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      batchId: batch.id,
    });
    expect(committed.recordCount).toBe(2);
    expect(committed.versionNumber).toBe(1);

    const records = await prisma.datasetRecord.findMany({
      where: { datasetVersionId: committed.versionId },
      orderBy: { sourceOrder: "asc" },
    });
    expect(records.map((record) => record.sourceId)).toEqual(["R-1", "R-2"]);
    expect(records[0]?.sourceOrder).toBe(1);

    const view = await getImportBatch(
      fixture.owner,
      batch.id,
      fixture.workspace.id,
    );
    expect(view.status).toBe("COMMITTED");

    await expect(
      commitImport({
        user: fixture.owner,
        workspaceId: fixture.workspace.id,
        projectId: fixture.project.id,
        roles: [...roles],
        batchId: batch.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects invalid UTF-8 without creating a batch", async () => {
    const fixture = await createEmptyProject("bad-utf8");
    await expect(
      createImportPreview({
        user: fixture.owner,
        workspaceId: fixture.workspace.id,
        projectId: fixture.project.id,
        roles: [...roles],
        fileName: "bad.csv",
        bytes: new Uint8Array([0xff, 0xfe]),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.importBatch.count()).toBe(0);
  });

  it("rejects expired previews and previews from non-creators", async () => {
    const fixture = await createEmptyProject("expiry");
    const batch = await createImportPreview({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      fileName: "data.csv",
      bytes: csv("id,text\n1,one\n"),
    });
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(
      commitImport({
        user: fixture.owner,
        workspaceId: fixture.workspace.id,
        projectId: fixture.project.id,
        roles: [...roles],
        batchId: batch.id,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_EXPIRED" });

    const fresh = await createImportPreview({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      fileName: "data.csv",
      bytes: csv("id,text\n1,one\n"),
    });
    const manager = await createUser("other-manager");
    await addMember(fixture.workspace.id, manager.id, ["MANAGER"]);
    await expect(
      commitImport({
        user: manager,
        workspaceId: fixture.workspace.id,
        projectId: fixture.project.id,
        roles: ["MANAGER"],
        batchId: fresh.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cleans expired staging, sessions, and rate-limit buckets but not committed data", async () => {
    const fixture = await createEmptyProject("cleanup");
    const stale = await createImportPreview({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      fileName: "old.csv",
      bytes: csv("id,text\n1,old\n"),
    });
    const committed = await createImportPreview({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      fileName: "old.csv",
      bytes: csv("id,text\n1,keep\n"),
    });
    await commitImport({
      user: fixture.owner,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      roles: [...roles],
      batchId: committed.id,
    });
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await prisma.importBatch.update({
      where: { id: stale.id },
      data: { expiresAt: old },
    });
    await prisma.session.create({
      data: {
        tokenHash: `old-${Date.now()}`,
        userId: fixture.owner.id,
        expiresAt: old,
      },
    });
    await prisma.rateLimitBucket.create({
      data: { key: `old-${Date.now()}`, windowStart: old, count: 2 },
    });

    const result = await cleanupStaleData({ force: true });
    expect(result.importBatches).toBe(1);
    expect(result.sessions).toBe(1);
    expect(result.rateLimitBuckets).toBe(1);
    expect(
      await prisma.importBatch.findUnique({ where: { id: committed.id } }),
    ).not.toBeNull();
    expect(await prisma.datasetRecord.count()).toBe(1);
  });
});
