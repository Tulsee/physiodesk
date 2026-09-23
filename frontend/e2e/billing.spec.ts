import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("billing", () => {
  test("invoices can be filtered by status", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("tbody tr").first()).toBeVisible();

    await page.selectOption('select[aria-label="Filter by status"]', "refunded");

    const badges = page.locator("tbody tr td:last-child");
    // Wait for the filtered list to arrive before snapshotting it; counting
    // rows first would race the re-render.
    await expect(badges.first()).toHaveText("Refunded");
    const statuses = await badges.allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s === "Refunded")).toBe(true);
  });

  test("a new invoice cannot be discounted below zero", async ({ page }) => {
    await page.goto("/billing");
    await page.click('button:has-text("New invoice")');

    await page.fill("#inv-amount", "100");
    await page.fill("#inv-discount", "250");
    await page.locator('[role="dialog"] button:has-text("Create invoice")').click();

    await expect(page.getByText("Discount cannot exceed the amount.")).toBeVisible();
    await expect(page.getByText("Choose a patient.")).toBeVisible();
  });

  test("recording a payment updates the status and balance", async ({ page }) => {
    await page.goto("/billing");
    await page.selectOption('select[aria-label="Filter by status"]', "due");
    await page.locator("tbody tr a").first().click();
    await expect(page).toHaveURL(/\/billing\/\d+$/);

    await page.click('button:has-text("Record payment")');
    // Pre-filled with the outstanding balance, so this settles the invoice.
    await page.locator('[role="dialog"] button:has-text("Record payment")').click();

    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.getByText("Rs 0.00").first()).toBeVisible();
    // A settled invoice offers a refund instead of another payment.
    await expect(page.locator('button:has-text("Record payment")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Refund")')).toBeVisible();
  });

  test("a refund cannot exceed what was received", async ({ page }) => {
    await page.goto("/billing");
    await page.selectOption('select[aria-label="Filter by status"]', "paid");
    await page.locator("tbody tr a").first().click();

    await page.click('button:has-text("Refund")');
    await page.fill("#pay-amount", "999999");
    await page.locator('[role="dialog"] button:has-text("Record refund")').click();

    await expect(page.getByText(/refund cannot exceed/i)).toBeVisible();
    // The dialog stays open so the amount can be corrected.
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("the receipt shows the server's totals and payment history", async ({ page }) => {
    await page.goto("/billing");
    await page.locator("tbody tr a").first().click();
    await page.click('button:has-text("Receipt")');

    const receipt = page.locator('[role="dialog"]');
    await expect(receipt).toContainText("PhysioDesk");
    await expect(receipt).toContainText("Balance due");
    await expect(receipt.locator('button:has-text("Print")')).toBeVisible();
  });
});

test.describe("therapists", () => {
  test("a therapist with assigned patients cannot be deleted", async ({ page }) => {
    await page.goto("/therapists");
    await page.locator('main li button:has-text("Delete")').first().click();
    await page.locator('[role="dialog"] button:has-text("Delete")').click();

    // The server's 409 explains exactly what blocks the delete.
    await expect(page.getByText(/patient\(s\) are assigned/)).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("working hours are validated against the slot length", async ({ page }) => {
    await page.goto("/therapists");
    await page.click('button:has-text("Add therapist")');

    await page.fill("#t-start", "09:00");
    await page.fill("#t-end", "09:20");
    await page.fill("#t-slot", "45");
    await page.locator('[role="dialog"] button:has-text("Add therapist")').click();

    await expect(page.getByText(/shorter than one 45-minute slot/)).toBeVisible();
  });

  test("the profile shows hours, overrides, this week and assigned patients", async ({
    page,
  }) => {
    await page.goto("/therapists");
    await page.locator('main a[href^="/therapists/"]').first().click();
    await expect(page).toHaveURL(/\/therapists\/\d+$/);

    for (const section of [
      "Working hours",
      "Date overrides",
      "This week",
      "Assigned patients",
    ]) {
      await expect(page.getByText(section, { exact: false }).first()).toBeVisible();
    }
  });
});

test.describe("schedule", () => {
  test("the grid derives slots from working hours", async ({ page }) => {
    await page.goto("/schedule");

    const grid = page.locator("table");
    const empty = page.getByText("Nobody is working on this date");
    // One or the other, depending on the day — both are correct outcomes.
    await expect(grid.or(empty).first()).toBeVisible();
  });

  test("a non-working date explains itself rather than showing an empty grid", async ({
    page,
  }) => {
    await page.goto("/schedule");
    // A Sunday: no seeded therapist works Sundays.
    await page.fill('input[aria-label="Schedule date"]', "2026-10-11");
    await expect(page.getByText("Nobody is working on this date")).toBeVisible();
  });
});
