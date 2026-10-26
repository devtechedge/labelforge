import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("public surface", () => {
  test("landing, login, and policies render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Raw records in",
    );
    await expect(
      page.getByRole("link", { name: /demo|create an account/i }).first(),
    ).toBeVisible();

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: "Terms of use" }),
    ).toBeVisible();
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy and retention" }),
    ).toBeVisible();
  });

  test("theme toggle persists across navigation", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /switch to dark theme/i });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /switch to light theme/i }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  });

  test("landing and login have no serious accessibility violations", async ({
    page,
  }) => {
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.filter((violation) =>
          ["serious", "critical"].includes(violation.impact ?? ""),
        ),
      ).toEqual([]);
    }
  });
});
