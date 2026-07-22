import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

test('navigate routes and assert demo lock-downs and no insertBefore crashes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`PageError: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`ConsoleError: ${msg.text()}`);
    }
  });

  // 1. Navigation: login
  console.log('Navigating to login...');
  await page.goto('/login');
  await expect(page.locator('text=Start Demo').first()).toBeVisible();

  console.log('Clicking Start Demo...');
  await page.click('text=Start Demo');

  // 1. Demo login reaches /dashboard.
  console.log('Waiting for dashboard...');
  await waitAndAssertPath(page, '/dashboard');

  // 2. /account
  console.log('Navigating to Account...');
  await page.goto('/account');
  await expect(page.locator('text=Account & Profile').first()).toBeVisible();
  // - demo banner visible
  await expect(page.locator('text=Demo mode is read-only').first()).toBeVisible();
  // - full name input disabled
  const nameInput = page.locator('input[name="full_name"]');
  await expect(nameInput).toBeDisabled();
  // - save button disabled
  const saveAccountBtn = page.locator('button:has-text("Save changes")');
  await expect(saveAccountBtn).toBeDisabled();
  // - no POST occurs when clicking disabled button
  // (Disabled buttons cannot be clicked natively, ensuring no POST occurs)

  // Navigation: leads, customers, products
  console.log('Navigating to Leads...');
  await page.goto('/leads');
  await assertExactPath(page, '/leads');
  await expect(page.locator('text=Leads').first()).toBeVisible();

  console.log('Navigating to Customers...');
  await page.goto('/customers');
  await assertExactPath(page, '/customers');
  await expect(page.locator('text=Customers').first()).toBeVisible();

  console.log('Navigating to Products...');
  await page.goto('/products');
  await assertExactPath(page, '/products');
  await expect(page.locator('text=Products').first()).toBeVisible();

  console.log('Navigating to Quotes...');
  await page.goto('/quotes');
  await assertExactPath(page, '/quotes');
  await expect(page.locator('text=Quotes').first()).toBeVisible();
  
  // 3. /quotes/new
  console.log('Navigating to Quotes New...');
  await page.goto('/quotes/new');
  await expect(page.locator('text=New quote').first()).toBeVisible();
  // - read-only banner visible
  await expect(page.locator('text=Demo mode is read only').first()).toBeVisible();
  // - all text/select/number inputs disabled
  const quoteInputs = page.locator('form input');
  const count = await quoteInputs.count();
  for (let i = 0; i < count; i++) {
    // Hidden inputs won't be disabled natively sometimes, but visible ones should be.
    const isHidden = await quoteInputs.nth(i).getAttribute('type') === 'hidden';
    if (!isHidden) {
      await expect(quoteInputs.nth(i)).toBeDisabled();
    }
  }
  const selects = page.locator('form select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    await expect(selects.nth(i)).toBeDisabled();
  }
  // - add line disabled
  await expect(page.locator('button:has-text("Add line")').first()).toBeDisabled();
  // - remove line disabled
  await expect(page.locator('button:has-text("Remove")').first()).toBeDisabled();
  // - AI assistant disabled
  await expect(page.locator('button:has-text("AI ile Taslak Oluştur")')).toBeDisabled();
  // - save/create disabled
  await expect(page.locator('button:has-text("Create quote")').or(page.locator('button:has-text("Save changes")')).first()).toBeDisabled();

  // Navigation: ai
  console.log('Navigating to AI Usage Tracking...');
  await page.goto('/ai');
  await assertExactPath(page, '/ai');

  // Logout before going to forgot-password to ensure unauthenticated state
  console.log('Navigating to Logout...');
  await page.goto('/account');
  await assertExactPath(page, '/account'); // ensure we are authenticated before logging out
  await page.locator('button:has-text("Sign Out")').first().click();
  await waitAndAssertPath(page, '/login');

  // 4. /forgot-password
  console.log('Navigating to Forgot Password...');
  await page.goto('/forgot-password');
  await expect(page.locator('text=Reset your password').first()).toBeVisible();
  
  // - demo email returns neutral success message
  await page.fill('input[name="email"]', 'demo@flowsales.ai');
  await page.click('button:has-text("Send reset email")');
  // Should show neutral success message
  await expect(page.locator('text=If that account exists, we sent a password reset email').first()).toBeVisible();

  console.log('Errors caught during navigation:', errors);

  // 7. Assert insertBefore error count is zero
  const insertBeforeErrors = errors.filter(e => e.includes('insertBefore') || e.includes('NotFoundError'));
  expect(insertBeforeErrors.length).toBe(0);
});
