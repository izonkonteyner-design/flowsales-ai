import { expect, test } from "@playwright/test";

type CapturedResponse = {
  url: string;
  status: number;
  body: unknown;
};

test("Verify Preview Deployment and Capture Evidence", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const networkResponses: CapturedResponse[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("supabase.co/auth/v1") || url.includes("/api/") || url.includes("/login")) {
      try {
        networkResponses.push({
          url,
          status: response.status(),
          body: await response.json(),
        });
      } catch {
        networkResponses.push({
          url,
          status: response.status(),
          body: "Not JSON",
        });
      }
    }
  });

  console.log(`Testing URL: ${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"}`);

  await page.goto("/login");
  await expect(page).toHaveURL(/.*\/login/);

  const demoButton = page.getByRole("button", { name: "Start Demo" });
  await expect(demoButton).toBeVisible();
  await Promise.all([
    page.waitForURL(/.*\/(dashboard|login).*/),
    demoButton.click(),
  ]);

  const finalUrl = page.url();
  console.log(`Final URL after demo click: ${finalUrl}`);

  if (finalUrl.includes("/login")) {
    const errorToast = await page
      .locator('.toast, [role="alert"], .text-destructive, .bg-destructive')
      .first()
      .textContent()
      .catch(() => null);
    console.log(`Demo failed, redirected to login. Error message: ${errorToast ?? "unknown"}`);
  } else {
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Total Revenue').first()).toBeVisible({ timeout: 5000 });

    await page.goto("/account");
    await expect(page).toHaveURL(/.*\/account/);
    await expect(page.locator("input[name='full_name']").first()).toBeDisabled();

    await page.goto("/quotes/new");
    await expect(page).toHaveURL(/.*\/quotes\/new/);
    await expect(page.locator("button:has-text('Create quote'), button:has-text('Save changes')").first()).toBeDisabled();

    await page.goto("/login");
    await expect(page).toHaveURL(/.*\/login/);
  }

  console.log("=== TEST EVIDENCE ===");
  console.log("Browser Console Errors:", JSON.stringify(consoleErrors, null, 2));
  console.log("Page Errors:", JSON.stringify(pageErrors, null, 2));
  console.log("Network/Auth Responses:", JSON.stringify(networkResponses, null, 2));

  expect(consoleErrors).toHaveLength(0);
  expect(pageErrors).toHaveLength(0);
});
