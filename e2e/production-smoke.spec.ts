import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

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
    await assertExactPath(page, '/login');

    // 3. Start Demo
    const demoButton = page.getByRole('button', { name: 'Start Demo' }).or(page.locator('button:has-text("Start Demo")')).first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    // 4. Dashboard
    await waitAndAssertPath(page, '/dashboard');
    await expect(page.locator('text=Workspace snapshot').first()).toBeVisible({ timeout: 10000 });

    // 5. Leads
    await page.goto('/leads');
    await assertExactPath(page, '/leads');

    // 6. Customers
    await page.goto('/customers');
    await assertExactPath(page, '/customers');

    // 7. Products
    await page.goto('/products');
    await assertExactPath(page, '/products');

    // 8. Quotes & Security Check
    await page.goto('/quotes');
    await assertExactPath(page, '/quotes');
    await page.goto('/quotes/new');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(page.getByRole('heading', { name: 'New quote' }).first()).toBeVisible();
    
    // In demo mode, quote creation should be disabled
    const saveQuoteBtn = page.locator('button:has-text("Save")').first();
    if (await saveQuoteBtn.isVisible()) {
      await expect(saveQuoteBtn).toBeDisabled();
    }

    // 9. AI
    await page.goto('/ai');
    await assertExactPath(page, '/ai');

    // 10. Account & Security Check
    await page.goto('/account');
    await assertExactPath(page, '/account');
    const firstNameInput = page.locator('input[name="firstName"]');
    if (await firstNameInput.isVisible()) {
      await expect(firstNameInput).toBeDisabled();
    }

    // 11. Logout
    await page.goto('/account');
    await assertExactPath(page, '/account'); // Ensure we are authenticated
    const signOutBtn = page.locator('button:has-text("Sign Out")').first();
    await signOutBtn.click();
    await waitAndAssertPath(page, '/login');
  });
});
