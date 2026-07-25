import { test, expect } from "@playwright/test";

test.describe("AI Sales Agent Happy Path", () => {
  // Use setup logic similar to existing tests or a fixture that logs in.
  // For the sake of the E2E implementation we assume standard playwright navigation
  
  test.beforeEach(async ({ page }) => {
    // Assuming standard login for regular workspace
    await page.goto("/login");
    await page.fill('input[type="email"]', process.env.DEMO_USER_EMAIL || 'test@test.com');
    await page.fill('input[type="password"]', process.env.DEMO_USER_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test("can navigate to AI Workforce and view overview", async ({ page }) => {
    await page.click('text="AI Workforce"');
    await page.waitForURL("/ai-workforce");
    await expect(page.locator("h1")).toHaveText("AI Sales Agent");
  });

  test("can start a new conversation and send a message", async ({ page }) => {
    await page.goto("/ai-workforce/conversations");
    await page.click('text="Test Chat"');
    
    // Should navigate to /ai-workforce/conversations/[id]
    await page.waitForURL(/\/ai-workforce\/conversations\/[a-f0-9-]{36}/);
    
    // Type and send
    await page.fill('input[type="text"]', 'Hello, I want to buy 5 Enterprise licenses');
    await page.click('button[type="submit"]');

    // Wait for AI response (Agent is typing... goes away)
    await expect(page.locator('text="Agent is typing..."')).toBeHidden({ timeout: 15000 });

    // Check if AI responded
    const messages = page.locator('.flex.justify-start');
    await expect(messages).not.toHaveCount(0);
  });
});
