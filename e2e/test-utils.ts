import { Page, expect } from '@playwright/test';

export async function assertExactPath(page: Page, expectedPath: string) {
  // Wait a short bit for any immediate redirects to settle
  await page.waitForLoadState('domcontentloaded');
  
  const urlObj = new URL(page.url());
  const actualPath = urlObj.pathname;
  
  if (actualPath === '/login' && expectedPath !== '/login') {
    throw new Error(`Navigation failed: unexpectedly redirected to /login instead of ${expectedPath}. Original URL: ${page.url()}`);
  }
  
  expect(actualPath).toBe(expectedPath);
}

export async function waitAndAssertPath(page: Page, expectedPath: string) {
  // Wait for either the expected path or a fallback to login with an error toast
  await page.waitForURL((url) => {
    if (url.pathname === expectedPath) return true;
    if (expectedPath !== '/login' && url.pathname === '/login' && url.searchParams.has('toast')) return true;
    return false;
  }, { timeout: 15000 });
  
  await assertExactPath(page, expectedPath);
}
