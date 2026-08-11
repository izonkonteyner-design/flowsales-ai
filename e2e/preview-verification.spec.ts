import { expect, test } from "@playwright/test";
import { assertExactPath } from "./test-utils";

const SIGN_IN = /sign in|giriş yap/i;
const START_DEMO = /start demo|demoyu dene|demo/i;
const TOTAL_REVENUE = /total revenue|toplam gelir/i;
const CREATE_OR_SAVE_QUOTE = /create quote|save changes|teklif oluştur|değişiklikleri kaydet|kaydet/i;

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
  await expect(page.getByRole("link", { name: SIGN_IN }).first()).toBeVisible();

  await page.goto("/login");
  await assertExactPath(page, "/login");
  await expect(page.getByRole("button", { name: START_DEMO }).first()).toBeVisible();

  const email = process.env.E2E_DEMO_EMAIL?.trim();
  const password = process.env.E2E_DEMO_PASSWORD?.trim();

  if (email && password) {
    await page.getByLabel(/email|e-posta/i).fill(email);
    await page.getByLabel(/password|şifre/i).fill(password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 20_000 }),
      page.getByRole("button", { name: SIGN_IN }).click(),
    ]);
    await assertExactPath(page, "/dashboard");
    await expect(page.getByText(TOTAL_REVENUE).first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/account");
    await assertExactPath(page, "/account");
    await expect(page.locator("input[name='full_name']").first()).toBeDisabled();

    await page.goto("/quotes/new");
    await assertExactPath(page, "/quotes/new");
    await expect(page.getByRole("button", { name: CREATE_OR_SAVE_QUOTE }).first()).toBeDisabled();
  } else {
    console.log("Authenticated production demo checks skipped: E2E_DEMO_EMAIL/PASSWORD are not configured.");
  }

  expect(consoleErrors).toHaveLength(0);
  expect(pageErrors).toHaveLength(0);
});
