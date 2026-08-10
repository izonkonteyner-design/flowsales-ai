import { expect, test } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './helpers/navigation';

test.describe('Production Smoke & Security Tests', () => {
  test('Complete production flow: auth, navigation, AI, security and logout @production', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FlowSales AI/);
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

    await page.goto('/login');
    await assertExactPath(page, '/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const demoButton = page.getByRole('button', { name: 'Start Demo' });
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    await waitAndAssertPath(page, '/dashboard');
    await expect(page.getByRole('heading', { name: 'Satış operasyonunuzu tek ekranda önceliklendirin.' })).toBeVisible({ timeout: 15000 });
    const dashboardHero = page.locator('section').first();
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
    await expect(page.getByRole('heading', { name: 'New quote' }).first()).toBeVisible();
    const saveQuoteBtn = page.locator('button:has-text("Save")').first();
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
