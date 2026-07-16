import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardPeriod,
  formatDashboardComparison,
  normalizeDashboardCurrency,
  normalizeDashboardSearchParams,
} from "@/server/services/dashboard-domain";

const NOW = new Date("2026-07-16T12:00:00.000Z");

test("dashboard range normalization covers current month and comparison periods", () => {
  const filters = normalizeDashboardSearchParams({ range: "current_month" }, "TRY", NOW);
  const period = buildDashboardPeriod(filters, NOW);

  assert.equal(period.start, "2026-07-01");
  assert.equal(period.end, "2026-07-16");
  assert.equal(period.comparisonStart, "2026-06-01");
  assert.equal(period.comparisonEnd, "2026-06-30");
  assert.equal(period.bucketSize, "day");
  assert.equal(period.label, "Current month");
  assert.equal(period.comparisonLabel, "Previous month");
});

test("dashboard range normalization supports previous month, rolling ranges, and current year", () => {
  const previousMonth = buildDashboardPeriod(normalizeDashboardSearchParams({ range: "previous_month" }, "TRY", NOW), NOW);
  const last30 = buildDashboardPeriod(normalizeDashboardSearchParams({ range: "last_30_days" }, "TRY", NOW), NOW);
  const last90 = buildDashboardPeriod(normalizeDashboardSearchParams({ range: "last_90_days" }, "TRY", NOW), NOW);
  const currentYear = buildDashboardPeriod(normalizeDashboardSearchParams({ range: "current_year" }, "TRY", NOW), NOW);

  assert.equal(previousMonth.start, "2026-06-01");
  assert.equal(previousMonth.end, "2026-06-30");
  assert.equal(previousMonth.comparisonStart, "2026-05-01");
  assert.equal(previousMonth.comparisonEnd, "2026-05-31");

  assert.equal(last30.start, "2026-06-17");
  assert.equal(last30.end, "2026-07-16");
  assert.equal(last30.comparisonStart, "2026-05-18");
  assert.equal(last30.comparisonEnd, "2026-06-16");

  assert.equal(last90.start, "2026-04-18");
  assert.equal(last90.end, "2026-07-16");
  assert.equal(last90.comparisonStart, "2026-01-18");
  assert.equal(last90.comparisonEnd, "2026-04-17");

  assert.equal(currentYear.start, "2026-01-01");
  assert.equal(currentYear.end, "2026-07-16");
  assert.equal(currentYear.comparisonStart, "2025-01-01");
  assert.equal(currentYear.comparisonEnd, "2025-07-16");
  assert.equal(currentYear.bucketSize, "month");
});

test("dashboard custom ranges normalize invalid input and reversed dates", () => {
  const reversed = normalizeDashboardSearchParams(
    { range: "custom", from: "2026-07-10", to: "2026-07-04" },
    "TRY",
    NOW,
  );
  const invalid = normalizeDashboardSearchParams(
    { range: "custom", from: "not-a-date", to: "also-bad" },
    "TRY",
    NOW,
  );
  const invalidRange = normalizeDashboardSearchParams({ range: "not-a-range" }, "USD", NOW);

  assert.equal(reversed.from, "2026-07-04");
  assert.equal(reversed.to, "2026-07-10");
  assert.equal(invalid.from, "2026-07-01");
  assert.equal(invalid.to, "2026-07-16");
  assert.equal(invalidRange.range, "current_month");
  assert.equal(invalidRange.currency, "USD");
});

test("dashboard currency normalization falls back safely", () => {
  assert.equal(normalizeDashboardCurrency("EUR", "TRY"), "EUR");
  assert.equal(normalizeDashboardCurrency("CAD", "TRY"), "TRY");
});

test("dashboard comparison formatting avoids invalid percentages", () => {
  assert.equal(
    formatDashboardComparison({
      current: 4,
      previous: 0,
      difference: 4,
      percentChange: null,
      direction: "no_previous",
      previousLabel: "previous period",
    }),
    "New vs previous period",
  );

  assert.equal(
    formatDashboardComparison({
      current: 0,
      previous: 0,
      difference: 0,
      percentChange: null,
      direction: "flat",
      previousLabel: "previous period",
    }),
    "No change vs previous period",
  );
});

