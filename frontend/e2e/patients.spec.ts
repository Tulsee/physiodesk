import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("patients list", () => {
  test("search narrows the list server-side", async ({ page }) => {
    await page.goto("/patients");
    const rows = page.locator("tbody tr");
    // count() does not auto-wait, so wait for the first row before counting —
    // otherwise this reads 0 while the skeleton is still up.
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    await page.fill('input[aria-label="Search patients"]', "anil");
    await expect(rows).not.toHaveCount(before);
    await expect(rows.first()).toContainText("Anil");
  });

  test("a search with no matches shows an empty state with a way out", async ({ page }) => {
    await page.goto("/patients");
    await page.fill('input[aria-label="Search patients"]', "zzzz-no-such-patient");

    await expect(page.getByText("No matching patients")).toBeVisible();
    await page.click('button:has-text("Clear filters")');
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("the status filter and the row count come from the server", async ({ page }) => {
    await page.goto("/patients");
    await page.selectOption('select[aria-label="Filter by status"]', "discharged");

    await expect(page.getByText(/Showing .* of .* patients/)).toBeVisible();

    const badges = page.locator("tbody tr td:nth-child(5)");
    // Wait for the filtered list before snapshotting, so the assertion does
    // not race the re-render.
    await expect(badges.first()).toHaveText("Discharged");
    const statuses = await badges.allTextContents();
    expect(statuses.every((s) => s === "Discharged")).toBe(true);
  });

  test("pagination walks forward and back", async ({ page }) => {
    await page.goto("/patients");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    const counter = page.getByText(/Page \d+ of \d+/);
    await expect(counter).toBeVisible();

    const first = await counter.textContent();
    await page.click('button[aria-label="Next page"]');
    await expect(counter).not.toHaveText(first!);

    await page.click('button[aria-label="Previous page"]');
    await expect(counter).toHaveText(first!);
    await expect(page.locator('button[aria-label="Previous page"]')).toBeDisabled();
  });

  test("the add form validates before sending anything", async ({ page }) => {
    await page.goto("/patients");
    await page.click('button:has-text("Add patient")');

    await page.fill("#age", "-5");
    await page.locator('[role="dialog"] button:has-text("Add patient")').click();

    await expect(page.getByText("Name is required.")).toBeVisible();
    await expect(page.getByText("Age must be between 0 and 120.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});

test.describe("patient profile", () => {
  test("has six tabs that switch without navigating", async ({ page }) => {
    await page.goto("/patients");
    await page.locator("tbody tr a").first().click();
    await expect(page).toHaveURL(/\/patients\/\d+$/);

    await expect(page.locator('[role="tab"]')).toHaveText([
      "Overview",
      "Session history",
      "Clinical notes",
      "Progress",
      "Reports",
      "Billing",
    ]);

    const url = page.url();
    for (const tab of ["Session history", "Clinical notes", "Reports", "Billing"]) {
      await page.click(`[role="tab"]:has-text("${tab}")`);
      await expect(page.locator('[role="tabpanel"]')).not.toBeEmpty();
    }
    // Tab state is client-side only.
    expect(page.url()).toBe(url);
  });

  test("progress renders one chart per measure, plus a table view", async ({ page }) => {
    await page.goto("/patients");
    await page.locator("tbody tr a").first().click();
    await page.click('[role="tab"]:has-text("Progress")');

    // Three separate scales mean three small multiples, never one shared axis.
    await expect(page.locator("figure h3")).toHaveText([
      "Pain",
      "Range of motion",
      "Strength",
    ]);

    await page.click('button:has-text("Show as table")');
    await expect(page.locator("table")).toBeVisible();
  });

  test("clinical note scores are bounded to the clinical scales", async ({ page }) => {
    await page.goto("/patients");
    await page.locator("tbody tr a").first().click();
    await page.click('[role="tab"]:has-text("Clinical notes")');
    await page.click('button:has-text("Add note")');

    await page.fill("#pain", "11");
    await page.fill("#strength", "9");
    await page.locator('[role="dialog"] button:has-text("Add note")').click();

    await expect(page.getByText("Pain is scored 0–10.")).toBeVisible();
    await expect(page.getByText("Strength is graded 0–5.")).toBeVisible();
  });

  test("a patient that does not exist reports it clearly", async ({ page }) => {
    await page.goto("/patients/999999");
    await expect(page.getByText(/not found|could not be found/i)).toBeVisible();
  });
});
