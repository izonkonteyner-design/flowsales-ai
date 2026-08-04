import { expect, test } from "@playwright/test";
import { assertExactPath } from "./test-utils";

test("Verify production deployment and protected demo surfaces @production", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://flowsales-ai-six.vercel.app";
  console.log(`Testing production URL: ${baseUrl}`);

  const health = await request.get(`${baseUrl}/api/health`);
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });

  await page.goto("/");
  await assertExactPath(page, "/");
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();

  await page.goto("/login");
  await assertExactPath(page, "/login");
  await expect(page.getByRole("button", { name: "Start Demo" })).toBeVisible();

  const email = process.env.E2E_DEMO_EMAIL?.trim();
  const password = process.env.E2E_DEMO_PASSWORD?.trim();

  if (email && password) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 20_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await assertExactPath(page, "/dashboard");
    await expect(page.locator("text=Total Revenue").first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/account");
    await assertExactPath(page, "/account");
    await expect(page.locator("input[name='full_name']").first()).toBeDisabled();

    await page.goto("/quotes/new");
    await assertExactPath(page, "/quotes/new");
    await expect(
      page.locator("button:has-text('Create quote'), button:has-text('Save changes')").first(),
    ).toBeDisabled();
  } else {
    console.log("Authenticated production demo checks skipped: E2E_DEMO_EMAIL/PASSWORD are not configured.");
  }

  expect(consoleErrors).toHaveLength(0);
  expect(pageErrors).toHaveLength(0);
});
