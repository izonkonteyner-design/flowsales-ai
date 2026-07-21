import { test, expect } from '@playwright/test';

test('navigate routes and assert no insertBefore crashes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`PageError: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`ConsoleError: ${msg.text()}`);
    }
  });

  console.log('Navigating to login...');
  await page.goto('/login');
  await expect(page.locator('text=Start Demo').first()).toBeVisible();

  console.log('Clicking Start Demo...');
  await page.click('text=Start Demo');

  // Wait for navigation to dashboard
  console.log('Waiting for dashboard...');
  await expect(page).toHaveURL(/.*\/dashboard/);

  // Navigate to Account
  console.log('Navigating to Account...');
  await page.goto('/account');
  await expect(page.locator('text=Account & Profile').first()).toBeVisible();

  // Navigate to Leads
  console.log('Navigating to Leads...');
  await page.goto('/leads');
  await expect(page.locator('text=Leads').first()).toBeVisible();

  // Navigate to Quotes
  console.log('Navigating to Quotes...');
  await page.goto('/quotes');
  await expect(page.locator('text=Quotes').first()).toBeVisible();
  
  // Navigate to Quotes New
  console.log('Navigating to Quotes New...');
  await page.goto('/quotes/new');
  await expect(page.locator('text=New quote').first()).toBeVisible();

  // Forgot password
  console.log('Navigating to Forgot Password...');
  await page.goto('/forgot-password');
  await expect(page.locator('text=Reset your password').first()).toBeVisible();

  console.log('Errors caught during navigation:', errors);

  const insertBeforeErrors = errors.filter(e => e.includes('insertBefore') || e.includes('NotFoundError'));
  expect(insertBeforeErrors.length).toBe(0);
});
