import { expect, test } from "@playwright/test";

import { CREDENTIALS, formError, signIn } from "./helpers";

test.describe("authentication", () => {
  test("an unauthenticated visitor is sent to the login screen", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an empty form is rejected without a request", async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]');
    await expect(formError(page)).toHaveText("Enter both your username and password.");
  });

  test("bad credentials show the server's message, not a session-expiry notice", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#username", CREDENTIALS.username);
    await page.fill("#password", "definitely-wrong");
    await page.click('button[type="submit"]');

    await expect(formError(page)).toHaveText("Incorrect username or password.");
    // The password is cleared so the next attempt starts fresh.
    await expect(page.locator("#password")).toHaveValue("");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing in reaches the dashboard and persists across a reload", async ({ page }) => {
    await signIn(page);
    await expect(page.locator("h1")).toHaveText("Dashboard");

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("every module is reachable from the sidebar", async ({ page }) => {
    await signIn(page);
    await expect(page.locator("nav a")).toHaveText([
      "Dashboard",
      "Patients",
      "Schedule",
      "Therapists",
      "Billing",
      "Notifications",
    ]);
  });

  test("signing out clears the session and re-arms the guard", async ({ page }) => {
    await signIn(page);
    await page.click("header button:has(span)");
    await page.click('[role="menuitem"]');
    await page.waitForURL("**/login");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
