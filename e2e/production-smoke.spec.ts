import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

const SIGN_IN = /sign in|giriş yap/i;
const START_DEMO = /start demo|demoyu dene|demo/i;
const NEW_QUOTE = /new quote|yeni teklif/i;
const SAVE = /save|kaydet/i;

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

  test('Complete production flow: auth, navigation, AI, security and logout @production', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FlowSales AI/);
    await expect(page.getByRole('link', { name: SIGN_IN }).first()).toBeVisible();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

    await page.goto('/login');
    await assertExactPath(page, '/login');
    await expect(page.getByRole('button', { name: SIGN_IN })).toBeVisible();

    const demoButton = page.getByRole('button', { name: START_DEMO }).first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    await waitAndAssertPath(page, '/dashboard');
    const dashboardHeading = page.getByRole('heading', { name: 'Satış operasyonunuzu tek ekranda önceliklendirin.' });
    await expect(dashboardHeading).toBeVisible({ timeout: 15000 });
    const dashboardHero = dashboardHeading.locator('xpath=ancestor::section[1]');
    const askAi = dashboardHero.locator('a[href="/ai"]');
    await expect(askAi).toBeVisible();
    await expect(dashboardHero.locator('a[href="/leads/new"]')).toBeVisible();

    await askAi.click();
    await waitAndAssertPath(page, '/ai');
    await expect(page.getByRole('heading', { name: 'YZ aksiyonları doğrulanmış potansiyel müşteri bağlamından çalışır.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fırsat seçin', exact: true })).toBeVisible();
    const aiLeadLinks = page.locator('a[href^="/leads/"][href$="/ai"]');
    await expect(aiLeadLinks.first()).toBeVisible();

    await page.goto('/leads');
    await assertExactPath(page, '/leads');

    await page.goto('/customers');
    await assertExactPath(page, '/customers');

    await page.goto('/products');
    await assertExactPath(page, '/products');

    await page.goto('/quotes');
    await assertExactPath(page, '/quotes');

    await page.goto('/quotes/new');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(page.getByRole('heading', { name: NEW_QUOTE }).first()).toBeVisible();
    const saveQuoteBtn = page.getByRole('button', { name: SAVE }).first();
    if (await saveQuoteBtn.isVisible()) {
      await expect(saveQuoteBtn).toBeDisabled();
    }

    await page.goto('/approvals');
    await assertExactPath(page, '/approvals');

    await page.goto('/ai-history');
    await assertExactPath(page, '/ai-history');

    await page.goto('/notifications');
    await assertExactPath(page, '/notifications');

    await page.goto('/operations');
    await assertExactPath(page, '/operations');

    await page.goto('/operations/ai-quality');
    await assertExactPath(page, '/operations/ai-quality');

    await page.goto('/account');
    await assertExactPath(page, '/account');
    const firstNameInput = page.locator('input[name="firstName"]');
    if (await firstNameInput.isVisible()) {
      await expect(firstNameInput).toBeDisabled();
    }

    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await waitAndAssertPath(page, '/login');
  });
});
