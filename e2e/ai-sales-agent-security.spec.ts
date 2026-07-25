import { test, expect } from "@playwright/test";

test.describe("AI Sales Agent Security (Demo Mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and start demo mode
    await page.goto("/login");
    await page.click('button:has-text("Start Demo")');
    await page.waitForURL("/dashboard");
  });

  test("demo user can view AI Workforce", async ({ page }) => {
    await page.goto("/ai-workforce");
    await expect(page.locator("h1")).toHaveText("AI Sales Agent");
  });

  test("demo user is blocked from approving actions", async ({ page }) => {
    // Go to chat and try to approve an action
    await page.goto("/ai-workforce/conversations/c1c1c1c1-0000-0000-0000-000000000001"); // our seeded conversation
    
    // There should be a proposed action and a button for it
    const approveBtn = page.locator('button:has-text("Demo Mode (View Only)")');
    
    // It should be disabled
    await expect(approveBtn).toBeDisabled();
  });
});
