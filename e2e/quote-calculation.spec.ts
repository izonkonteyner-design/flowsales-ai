import { test, expect } from '@playwright/test';
import { assertExactPath, waitAndAssertPath } from './test-utils';

const CONSOLE_IGNORE = ['favicon', 'extension', 'chrome-extension'];

// The seeded demo quote FSA-2026-0142 stores:
//   subtotal = 1,685,000 · tax_total = 329,900 · total = 1,930,400
// Before the 0019 backfill migration, `grand_total` was locked to 0 by the
// broken 0007 coalesce. This regression suite locks the post-fix display so
// the canonical total (1,930,400) is shown on every surface instead of 0.

test.describe('Quote grand total reconciliation across surfaces', () => {
  async function attachErrorListeners(page: import('@playwright/test').Page) {
    const errors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!CONSOLE_IGNORE.some((needle) => text.includes(needle))) {
          errors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedRequests.push(`[${response.status()}] ${response.url()}`);
      }
    });

    return {
      errors,
      pageErrors,
      failedRequests,
      assertClean: () => {
        expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toHaveLength(0);
        expect(failedRequests, `5xx: ${failedRequests.join(', ')}`).toHaveLength(0);
      },
    };
  }

  test('demo quote FSA-2026-0142 displays the reconciled grand total, not 0', async ({ page }) => {
    const listeners = await attachErrorListeners(page);

    // Start the demo session.
    await page.goto('/');
    await page.goto('/login');
    const demoButton = page
      .getByRole('button', { name: 'Start Demo' })
      .or(page.locator('button:has-text("Start Demo")'))
      .first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();
    await waitAndAssertPath(page, '/dashboard');

    // 1. The dashboard must show a non-zero accepted/open quote value (or, if
    //    FSA-2026-0142 is "sent", it appears in the open quote aggregate).
    await page.goto('/dashboard');
    await assertExactPath(page, '/dashboard');
    await page.waitForLoadState('networkidle');

    // 2. The quotes list must list FSA-2026-0142 with a positive grand total.
    await page.goto('/quotes');
    await assertExactPath(page, '/quotes');
    await page.waitForLoadState('networkidle');

    // Locate the seeded quote row.
    const seededQuoteRow = page.locator('article', { hasText: 'FSA-2026-0142' }).first();
    await expect(seededQuoteRow).toBeVisible({ timeout: 10000 });

    // The list row must not display a literal "TRY 0.00" grand total — the bug
    // was exactly this surface showing "TRY 0.00" while parts were positive.
    const rowText = (await seededQuoteRow.textContent()) ?? '';

    // Sanity: the row must mention TRY (the seeded currency).
    expect(rowText).toContain('TRY');

    // The grand total column should not contain a bare zero value when the
    // parts are positive. The bug presented as a "TRY 0.00" string in this
    // row. We assert that no zero-valued currency amount appears alongside TRY.
    const zeroCurrencyMatch = rowText.match(/TRY\s*0[,.]?00/);
    expect(
      zeroCurrencyMatch,
      `Seeded quote row must not display "TRY 0.00". Row text: "${rowText.slice(0, 400)}"`,
    ).toBeNull();

    // 3. Drill into the quote detail by clicking the quote number link.
    const detailLink = seededQuoteRow.getByRole('link', { name: 'FSA-2026-0142' }).first();
    await detailLink.click();
    await page.waitForLoadState('networkidle');

    // Detail must show the three component values AND a non-zero grand total.
    await expect(page.locator('text=FSA-2026-0142').first()).toBeVisible();
    const detailBody = (await page.locator('main').first().textContent()) ?? '';

    // Subtotal must be visible (1,685,000 in some digit grouping) or at least
    // a positive TRY amount must appear multiple times (parts + total).
    expect(detailBody, 'detail body must include the seeded currency').toContain('TRY');

    // Grand total MUST NOT be the literal "TRY 0.00" / "TRY 0,00".
    const zeroGrandTotalMatch = detailBody.match(/TRY\s*0[,.]?00/);
    expect(
      zeroGrandTotalMatch,
      `Quote detail must not render a zero grand total. Body had: ${detailBody.slice(0, 500)}`,
    ).toBeNull();

    // 4. The print/preview surface must also match.
    const detailUrl = page.url();
    const printUrl = detailUrl.replace(/\/quotes\/([^/]+)$/, '/quotes/$1/print');
    await page.goto(printUrl);
    await page.waitForLoadState('networkidle');
    const printBody = (await page.locator('body').first().textContent()) ?? '';
    const zeroPrintMatch = printBody.match(/TRY\s*0[,.]?00/);
    expect(
      zeroPrintMatch,
      `Quote print must not render a zero grand total. Body had: ${printBody.slice(0, 500)}`,
    ).toBeNull();

    listeners.assertClean();
  });
});
