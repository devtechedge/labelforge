import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const base = "http://localhost:3000";
const out = "C:/tmp/labelforge-qa";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const allErrors = [];

async function newPage(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") allErrors.push(msg.text());
  });
  page.on("pageerror", (err) => allErrors.push(`PAGEERROR: ${err.message}`));
  return { context, page };
}

async function loginDemo(page, role) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL("**/workspaces", { timeout: 20000 });
}

async function openFeedbackProject(page) {
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
  await page.waitForLoadState("networkidle");
}

const owner = await newPage();
await loginDemo(owner.page, "Owner");
await openFeedbackProject(owner.page);
await owner.page.screenshot({ path: `${out}/10-owner-project.png`, fullPage: true });
console.log("project h1", await owner.page.locator("h1").first().innerText());

await owner.page.locator(".project-tabs").getByRole("link", { name: "Schema", exact: true }).click();
await owner.page.waitForURL("**/schema");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/11-schema.png`, fullPage: true });
console.log("schema statuses", await owner.page.locator(".badge").allInnerTexts());

await owner.page.locator(".project-tabs").getByRole("link", { name: "Review", exact: true }).click();
await owner.page.waitForURL("**/review");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/12-review-queue.png`, fullPage: true });
const queueItems = owner.page.locator(".queue-item");
console.log("review queue items", await queueItems.count());
if ((await queueItems.count()) > 0) {
  await queueItems.first().click();
  await owner.page.waitForLoadState("networkidle");
  await owner.page.screenshot({ path: `${out}/13-review-detail.png`, fullPage: true });
  console.log(
    "review detail text",
    (await owner.page.locator(".review-grid").innerText()).slice(0, 1200),
  );
}

await owner.page.locator(".project-tabs").getByRole("link", { name: "Quality", exact: true }).click();
await owner.page.waitForURL("**/quality");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/14-quality.png`, fullPage: true });
console.log(
  "quality text",
  (await owner.page.locator("main").innerText()).slice(0, 1600),
);

await owner.page.locator(".project-tabs").getByRole("link", { name: "Releases", exact: true }).click();
await owner.page.waitForURL("**/releases");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/15-releases.png`, fullPage: true });
const bundleHref = await owner.page
  .getByRole("link", { name: "Download release bundle" })
  .first()
  .getAttribute("href");
console.log("bundle href", bundleHref);
if (bundleHref) {
  const res = await owner.context.request.get(`${base}${bundleHref}`);
  console.log("bundle status", res.status(), res.headers()["content-type"]);
  const bytes = new Uint8Array(await res.body());
  writeFileSync(`${out}/release.zip`, bytes);
  const files = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const jsonl = files["dataset.jsonl"];
  const hash = createHash("sha256").update(jsonl).digest("hex");
  console.log("export files", Object.keys(files));
  console.log("checksum matches", hash === manifest.checksums.jsonlSha256, manifest.counts);
}

await owner.page.locator(".project-tabs").getByRole("link", { name: "Import", exact: true }).click();
await owner.page.waitForURL("**/import");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/16-import.png`, fullPage: true });

await owner.page.locator(".project-tabs").getByRole("link", { name: "Tasks", exact: true }).click();
await owner.page.waitForURL("**/tasks");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/17-tasks.png`, fullPage: true });

await owner.page.goto(`${base}/workspaces`, { waitUntil: "networkidle" });
await owner.page
  .locator(".workspace-card")
  .filter({ hasText: "Meridian Review Lab" })
  .click();
await owner.page.getByRole("link", { name: "Workspace settings" }).click();
await owner.page.waitForURL("**/settings");
await owner.page.waitForLoadState("networkidle");
await owner.page.screenshot({ path: `${out}/18-settings.png`, fullPage: true });
console.log("settings members", await owner.page.locator(".member-row").count());

const annotator = await newPage();
await loginDemo(annotator.page, "Annotator");
await openFeedbackProject(annotator.page);
await annotator.page.locator(".project-tabs").getByRole("link", { name: "Tasks", exact: true }).click();
await annotator.page.waitForURL("**/tasks");
await annotator.page.waitForLoadState("networkidle");
await annotator.page.screenshot({ path: `${out}/20-annotator-tasks.png`, fullPage: true });
console.log(
  "annotator work links",
  await annotator.page.getByRole("link", { name: /Continue|Open workbench/ }).count(),
);
const continueLink = annotator.page
  .getByRole("link", { name: "Continue", exact: true })
  .first();
const fallbackWork = annotator.page
  .getByRole("link", { name: "Open workbench", exact: true })
  .first();
const workLink = (await continueLink.count()) > 0 ? continueLink : fallbackWork;
if ((await workLink.count()) > 0) {
  await workLink.click();
  await annotator.page.waitForURL("**/annotate/**");
  await annotator.page.waitForLoadState("networkidle");
  await annotator.page.screenshot({ path: `${out}/21-workbench.png`, fullPage: true });
  console.log("workbench url", annotator.page.url());
  console.log("save state", await annotator.page.locator(".save-state").innerText());
  const notes = annotator.page.getByLabel("Reviewer note");
  if ((await notes.count()) > 0) {
    const current = await notes.inputValue();
    await notes.fill(`${current} QA persistence check ${Date.now()}.`);
    await annotator.page.waitForFunction(
      () => document.querySelector(".save-state")?.textContent?.includes("Saved"),
      null,
      { timeout: 15000 },
    );
    console.log("save state after edit", await annotator.page.locator(".save-state").innerText());
    await annotator.page.reload({ waitUntil: "networkidle" });
    const persisted = await annotator.page.getByLabel("Reviewer note").inputValue();
    console.log("persisted", persisted.includes("QA persistence check"));
    await annotator.page.screenshot({ path: `${out}/22-workbench-saved.png`, fullPage: true });
    await annotator.page.getByRole("button", { name: "Submit for review" }).click();
    const dialog = annotator.page.locator("dialog[open]");
    console.log("submit dialog", await dialog.count());
    if ((await dialog.count()) > 0) {
      await annotator.page.getByRole("button", { name: "Confirm submission" }).click();
      await annotator.page.waitForSelector(".success-note", { timeout: 15000 });
      console.log("submit result", await annotator.page.locator(".success-note").innerText());
      await annotator.page.screenshot({ path: `${out}/23-workbench-submitted.png`, fullPage: true });
    }
  }
}

const mobile = await newPage({ width: 390, height: 844 });
await loginDemo(mobile.page, "Annotator");
await openFeedbackProject(mobile.page);
await mobile.page.locator(".project-tabs").getByRole("link", { name: "Tasks", exact: true }).click();
await mobile.page.waitForURL("**/tasks");
await mobile.page.waitForLoadState("networkidle");
await mobile.page.screenshot({ path: `${out}/30-mobile-tasks.png`, fullPage: true });
const mobileWork = mobile.page
  .getByRole("link", { name: /Continue|Open workbench/ })
  .first();
if ((await mobileWork.count()) > 0) {
  await mobileWork.click();
  await mobile.page.waitForLoadState("networkidle");
  await mobile.page.screenshot({ path: `${out}/31-mobile-workbench.png`, fullPage: true });
}

console.log("console errors", [...new Set(allErrors)]);
await browser.close();
