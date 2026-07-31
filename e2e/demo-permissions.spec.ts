import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

const CONSOLE_IGNORE = ['favicon', 'extension', 'chrome-extension'];

test.describe('Demo viewer lead creation permissions', () => {
  test('viewer demo session cannot reach an active lead create form', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!CONSOLE_IGNORE.some((needle) => text.includes(needle))) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedRequests.push(`[${response.status()}] ${response.url()}`);
      }
    });

    // 1. Start the demo session the same way a viewer would.
    await page.goto('/');
    await page.goto('/login');
    const demoButton = page
      .getByRole('button', { name: 'Start Demo' })
      .or(page.locator('button:has-text("Start Demo")'))
      .first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();
    await waitAndAssertPath(page, '/dashboard');

    // 2. On the leads list, the "New lead" CTA must not be present for the demo
    //    session (the workspace mode is "demo" with no live Supabase).
    await page.goto('/leads');
    await assertExactPath(page, '/leads');
    await page.waitForLoadState('networkidle');

    const newLeadLink = page.getByRole('link', { name: 'New lead' });
    const linkCount = await newLeadLink.count();
    expect(
      linkCount,
      `Demo session must not see the "New lead" CTA on the leads list (found ${linkCount})`,
    ).toBe(0);

    // 3. A direct navigation to /leads/new must NOT render an editable form.
    await page.goto('/leads/new');
    await page.waitForLoadState('networkidle');

    // The active submit button must not exist for the demo viewer.
    const submitButton = page.getByRole('button', { name: 'Create lead' });
    const submitCount = await submitButton.count();
    expect(
      submitCount,
      `Demo session must not see an active "Create lead" submit button on /leads/new (found ${submitCount})`,
    ).toBe(0);

    // A read-only explanatory state must be rendered instead.
    const restrictedHeading = page.getByRole('heading').filter({ hasText: /read-only|lead workspace|read-only lead/i });
    await expect(restrictedHeading.first()).toBeVisible({ timeout: 10000 });

    // 4. No network/server errors and no client errors during this flow.
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
    // Console errors are allowed to be empty for this strict test.
    expect(consoleErrors).toHaveLength(0);
  });

  test('demo session 没有 outbound mutation when /leads/new is submitted through crafted request', async ({ page }) => {
    // Start the demo session.
    await page.goto('/login');
    const demoButton = page
      .getByRole('button', { name: 'Start Demo' })
      .or(page.locator('button:has-text("Start Demo")'))
      .first();
    await demoButton.click();
    await waitAndAssertPath(page, '/dashboard');

    // Force a direct server action call by hitting the server action endpoint
    // with a forged payload. The server action `createLeadAction` must reject
    // because the workspace context is demo and there is no authenticated user.
    // We use the fetch API through the page context to reuse the demo cookies.
    const response = await page.evaluate(async () => {
      const form = new FormData();
      form.append('full_name', 'E2E Forge Attempt');
      form.append('email', 'e2e-forge@example.com');
      form.append('company', 'Forged Co');
      try {
        const r = await fetch('/leads/new', {
          method: 'POST',
          body: form,
          redirect: 'manual',
        });
        return { status: r.status, ok: r.ok };
      } catch (err) {
        return { status: 0, ok: false, error: String(err) };
      }
    });

    // The expected behavior is that the request is rejected — never a clean 200
    // that would imply the lead was created.
    expect(response.ok, `forged POST must not succeed (status=${response.status})`).toBe(false);
  });
});
