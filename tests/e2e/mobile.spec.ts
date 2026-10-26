import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile annotator workbench remains usable", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Annotator", exact: true }).click();
  await page.waitForURL("**/workspaces");
  await page
    .locator(".workspace-card")
    .filter({ hasText: "Meridian Review Lab" })
    .click();
  await page.waitForURL("**/workspaces/**");
  await page
    .locator(".workspace-card")
    .filter({ hasText: "Product feedback triage" })
    .click();
  await page.waitForURL("**/projects/**");
  await page.locator(".project-tabs").getByRole("link", { name: "Tasks" }).click();
  await page.waitForURL("**/tasks");
  const workLink = page.getByRole("link", { name: /Continue|Open workbench/ }).first();
  await expect(workLink).toBeVisible();
  await workLink.click();
  await page.waitForURL("**/annotate/**");
  await expect(page.locator(".schema-panel")).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
