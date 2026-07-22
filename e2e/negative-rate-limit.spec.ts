import { test, expect } from '@playwright/test';
import { waitAndAssertPath } from './test-utils';

test('assertExactPath catches false-positive redirects @negative', async ({ page, context }) => {
  // Set the force fail header for all requests in this context
  await context.setExtraHTTPHeaders({
    'x-e2e-force-fail': 'true'
  });

  await page.goto('/login');

  // Trigger demo login, which will send a POST request with the header
  const demoButton = page.getByRole('button', { name: 'Start Demo' }).or(page.locator('button:has-text("Start Demo")')).first();
  await expect(demoButton).toBeVisible();
  
  // Do not await the click, we just want to start the navigation
  await demoButton.click();

  let errorCaught = false;
  try {
    // This will wait for navigation. It will see the redirect to /login and throw.
    await waitAndAssertPath(page, '/dashboard');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unexpectedly redirected to /login instead of /dashboard')) {
      errorCaught = true;
    }
  }

  expect(errorCaught).toBe(true);
});
