import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

// TEMPORARY verification spec (session persistence after refresh) — deleted after run.
test('Demo login -> refresh -> session persists -> logout', async ({ page }) => {
  await page.goto('/login');
  await assertExactPath(page, '/login');

  const demoButton = page.getByRole('button', { name: 'Start Demo' }).or(page.locator('button:has-text("Start Demo")')).first();
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await waitAndAssertPath(page, '/dashboard');
  await expect(page.locator('text=Workspace snapshot').first()).toBeVisible({ timeout: 10000 });

  // Session persistence after refresh
  await page.reload();
  await assertExactPath(page, '/dashboard');
  await expect(page.locator('text=Workspace snapshot').first()).toBeVisible({ timeout: 10000 });

  // Logout
  await page.goto('/account');
  await assertExactPath(page, '/account');
  const signOutBtn = page.locator('button:has-text("Sign Out")').first();
  await signOutBtn.click();
  await waitAndAssertPath(page, '/login');

  // After logout, refresh should not resurrect the session
  await page.reload();
  await assertExactPath(page, '/login');
});
