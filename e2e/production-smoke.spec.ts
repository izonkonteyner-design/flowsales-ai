import { test, expect } from '@playwright/test';

test.describe('Production Smoke & Security Tests', () => {
  let errors: string[] = [];
  let pageErrors: string[] = [];
  let failedRequests: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    pageErrors = [];
    failedRequests = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known third-party extension noise
        if (!text.includes('favicon') && !text.includes('extension') && !text.includes('chrome-extension')) {
          errors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    page.on('response', response => {
      if (response.status() >= 500) {
        failedRequests.push(`[${response.status()}] ${response.url()}`);
      }
    });
  });

  test.afterEach(() => {
    expect(errors, `Console errors found: ${errors.join(', ')}`).toHaveLength(0);
    expect(pageErrors, `Page errors found: ${pageErrors.join(', ')}`).toHaveLength(0);
    expect(failedRequests, `500 Server errors found: ${failedRequests.join(', ')}`).toHaveLength(0);
  });

  test('Complete flow: Navigation, Demo Security and Logout', async ({ page }) => {
    // 1. Homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/FlowSales AI/);

    // 2. Login Page
    await page.goto('/login');
    await expect(page).toHaveURL(/.*\/login/);

    // 3. Start Demo
    const demoButton = page.getByRole('button', { name: 'Start Demo' }).or(page.locator('button:has-text("Start Demo")')).first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    // 4. Dashboard
    await page.waitForURL(/.*\/dashboard/);
    await expect(page.locator('text=Total Revenue').first()).toBeVisible({ timeout: 10000 });

    // 5. Leads
    await page.goto('/leads');
    await expect(page).toHaveURL(/.*\/leads/);

    // 6. Customers
    await page.goto('/customers');
    await expect(page).toHaveURL(/.*\/customers/);

    // 7. Products
    await page.goto('/products');
    await expect(page).toHaveURL(/.*\/products/);

    // 8. Quotes & Security Check
    await page.goto('/quotes');
    await expect(page).toHaveURL(/.*\/quotes/);
    await page.goto('/quotes/new');
    
    // In demo mode, quote creation should be disabled
    const saveQuoteBtn = page.locator('button:has-text("Save")').first();
    if (await saveQuoteBtn.isVisible()) {
      await expect(saveQuoteBtn).toBeDisabled();
    }

    // 9. AI
    await page.goto('/ai');
    await expect(page).toHaveURL(/.*\/ai/);

    // 10. Account & Security Check
    await page.goto('/account');
    await expect(page).toHaveURL(/.*\/account/);
    const firstNameInput = page.locator('input[name="firstName"]');
    if (await firstNameInput.isVisible()) {
      await expect(firstNameInput).toBeDisabled();
    }

    // 11. Logout
    const profileBtn = page.getByRole('button', { name: /account/i }).or(page.locator('button:has-text("Profile")')).first();
    await profileBtn.click();
    await page.locator('text="Log out"').click();
    await page.waitForURL(/.*\/login/);
  });
});
