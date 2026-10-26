import { expect, test, type Page } from "@playwright/test";

async function demoLogin(page: Page, role: "Owner" | "Manager" | "Reviewer" | "Annotator") {
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL("**/workspaces");
}

test("owner can browse the seeded project and mobile workbench", async ({
  page,
}) => {
  await demoLogin(page, "Owner");
  await page.locator(".workspace-card").filter({ hasText: "Meridian Review Lab" }).click();
  await page.waitForURL("**/workspaces/**");
  await expect(page.getByRole("heading", { name: "Meridian Review Lab" })).toBeVisible();
  await page
    .locator(".workspace-card")
    .filter({ hasText: "Product feedback triage" })
    .click();
  await page.waitForURL("**/projects/**");
  await expect(page.locator(".project-tabs")).toContainText("Quality");
  await expect(page.locator(".project-tabs")).toContainText("Releases");
  const projectUrl = page.url();
  expect(projectUrl).toContain("/projects/");
});

test("outsider cannot access another workspace project", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await demoLogin(owner, "Owner");
  await owner.locator(".workspace-card").filter({ hasText: "Meridian Review Lab" }).click();
  await owner.waitForURL("**/workspaces/**");
  await owner.locator(".workspace-card").filter({ hasText: "Product feedback triage" }).click();
  await owner.waitForURL("**/projects/**");
  const projectUrl = owner.url();
  await ownerContext.close();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await outsider.goto("/login");
  await outsider.getByLabel("Email").fill("outsider@labelforge.demo");
  await outsider.getByLabel("Password").fill("DemoPass!2026");
  await outsider.getByRole("button", { name: "Sign in", exact: true }).click();
  await outsider.waitForURL("**/workspaces");
  const response = await outsider.request.get(
    new URL(projectUrl, "http://localhost:3000").pathname,
  );
  expect(response.status()).toBe(404);
  expect(await outsider.locator(".workspace-card").count()).toBe(0);
  await outsiderContext.close();
});
