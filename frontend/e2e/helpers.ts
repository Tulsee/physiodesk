import type { Page } from "@playwright/test";

export const CREDENTIALS = {
  username: process.env.E2E_USERNAME ?? "frontdesk",
  password: process.env.E2E_PASSWORD ?? "physiodesk123",
};

/** Sign in and land on the dashboard. */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill("#username", CREDENTIALS.username);
  await page.fill("#password", CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

/** The form-level error banner, scoped so it does not match Next's route announcer. */
export function formError(page: Page) {
  return page.locator('form [role="alert"], [role="dialog"] [role="alert"]');
}
