import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync } from "fflate";

async function demoLogin(page: Page, role: "Owner" | "Manager" | "Reviewer" | "Annotator") {
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL("**/workspaces");
}

async function seriousViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
}

test.describe("fresh project journey", () => {
  test("owner, annotator, reviewer, and release lifecycle", async ({ browser }) => {
    test.setTimeout(180_000);
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    await demoLogin(owner, "Owner");
    await owner
      .locator(".workspace-card")
      .filter({ hasText: "Meridian Review Lab" })
      .click();
    await owner.waitForURL("**/workspaces/**");
    await owner.getByRole("link", { name: "New project" }).click();
    await owner.waitForURL("**/projects/new");
    const projectName = `E2E journey ${Date.now()}`;
    await owner.getByLabel("Project name").fill(projectName);
    await owner
      .getByLabel("Description")
      .fill("End-to-end journey fixture with synthetic reviews.");
    await owner.getByRole("button", { name: "Create project" }).click();
    await owner.waitForURL("**/projects/**");
    await expect(owner.getByRole("heading", { name: projectName })).toBeVisible();
    const projectUrl = owner.url();

    await owner.locator(".project-tabs").getByRole("link", { name: "Import" }).click();
    await owner.waitForURL("**/import");
    await owner.locator("#import-file").setInputFiles("public/samples/reviews-valid.csv");
    await owner.getByRole("button", { name: "Preview import" }).click();
    await expect(
      owner.getByRole("button", { name: /Commit 12 valid rows/ }),
    ).toBeVisible({ timeout: 20_000 });
    await owner.getByRole("button", { name: /Commit 12 valid rows/ }).click();
    await expect(owner.getByText(/Dataset version v1 committed with 12 records/)).toBeVisible();

    await owner.locator(".project-tabs").getByRole("link", { name: "Schema" }).click();
    await owner.waitForURL("**/schema");
    await owner.getByRole("button", { name: "Create draft schema" }).click();
    await expect(owner.getByText(/Draft schema v1 created/)).toBeVisible();
    await owner.getByRole("button", { name: "Publish v1" }).click();
    await expect(owner.getByText(/Schema published\. You can now generate tasks/)).toBeVisible();
    await owner.getByRole("button", { name: "Generate tasks" }).click();
    await expect(owner.getByText(/12 tasks created/)).toBeVisible();

    await owner.locator(".project-tabs").getByRole("link", { name: "Tasks" }).click();
    await owner.waitForURL("**/tasks");
    await owner
      .getByRole("checkbox", { name: "Select all tasks on this page" })
      .check();
    await owner.getByLabel("Annotator").selectOption({ label: "Maya Okafor" });
    await owner.getByRole("button", { name: "Assign selected", exact: true }).click();
    await expect(owner.getByText(/Assigned 12 tasks/)).toBeVisible();

    const annotatorContext = await browser.newContext();
    const annotator = await annotatorContext.newPage();
    await demoLogin(annotator, "Annotator");
    await annotator.goto(projectUrl);
    await annotator.locator(".project-tabs").getByRole("link", { name: "Tasks" }).click();
    await annotator.waitForURL("**/tasks");
    await annotator.getByRole("link", { name: "Open workbench" }).first().click();
    await annotator.waitForURL("**/annotate/**");
    await expect(annotator.locator(".save-state")).toBeVisible();

    const workbenchViolations = await seriousViolations(annotator);
    expect(workbenchViolations).toEqual([]);
    await annotator.getByRole("button", { name: /switch to dark theme/i }).click();
    const darkViolations = await seriousViolations(annotator);
    expect(darkViolations).toEqual([]);

    await annotator.getByRole("radio", { name: "Bug" }).check();
    await expect(annotator.locator(".save-state")).toContainText(/Saved/);
    await annotator.reload();
    await expect(annotator.getByRole("radio", { name: "Bug" })).toBeChecked();
    await annotator.getByRole("button", { name: "Submit for review" }).click();
    await annotator.getByRole("button", { name: "Confirm submission" }).click();
    await expect(annotator.getByText(/Submitted for review/)).toBeVisible();

    const reviewerContext = await browser.newContext();
    const reviewer = await reviewerContext.newPage();
    await demoLogin(reviewer, "Reviewer");
    await reviewer.goto(projectUrl);
    await reviewer.locator(".project-tabs").getByRole("link", { name: "Review" }).click();
    await reviewer.waitForURL("**/review");
    await reviewer.locator(".queue-item").first().click();
    await reviewer.waitForURL(/task=/);
    await expect(reviewer.getByRole("button", { name: "Begin review" })).toBeVisible();
    await reviewer.getByRole("button", { name: "Begin review" }).click();
    await expect(reviewer.getByRole("button", { name: "Record decision" })).toBeVisible();
    await reviewer.getByRole("button", { name: "Record decision" }).click();
    await expect(reviewer.getByText(/Decision recorded\. The task left the review queue/)).toBeVisible();

    await owner.goto(`${projectUrl}/releases`);
    await owner.getByRole("button", { name: "Publish release" }).click();
    await owner.getByRole("button", { name: "Publish immutable release" }).click();
    await expect(owner.getByText(/Release v1 published/)).toBeVisible();
    const bundleHref = await owner
      .getByRole("link", { name: "Download release bundle" })
      .first()
      .getAttribute("href");
    expect(bundleHref).toBeTruthy();
    const response = await ownerContext.request.get(bundleHref!);
    expect(response.status()).toBe(200);
    const files = unzipSync(new Uint8Array(await response.body()));
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    expect(manifest.counts.recordCount).toBe(1);
    expect(manifest.counts.excludedCount).toBe(11);
    expect(files["dataset.jsonl"]).toBeTruthy();

    await reviewerContext.close();
    await annotatorContext.close();
    await ownerContext.close();
  });
});
