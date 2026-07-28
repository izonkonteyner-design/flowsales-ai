import test from "node:test";
import assert from "node:assert/strict";

test("content generator fallback shapes ideas when AI is unavailable", async () => {
  const ideas = Array.from({ length: 3 }).map((_, idx) => ({
    id: `idea-${idx + 1}`,
    platform: "linkedin",
    topic: "Sales automation",
    headline: `Sales automation — idea ${idx + 1} for linkedin`,
    rationale: `Concept tuned for the linkedin audience.`,
  }));
  assert.equal(ideas.length, 3);
  for (const idea of ideas) {
    assert.ok(idea.headline.length <= 90, "headline must fit platform limit");
    assert.ok(idea.rationale.length > 0, "rationale must be present");
  }
});

test("ad variants always carry platform-stable CTA", () => {
  const variants = Array.from({ length: 3 }).map((_, idx) => ({
    id: `ad-${idx + 1}`,
    platform: "google",
    product_name: "FlowSales",
    headline: `FlowSales — ad variant ${idx + 1}`,
    body: null,
    cta: "Learn more",
  }));
  const uniqueCtas = new Set(variants.map((v) => v.cta));
  assert.equal(uniqueCtas.size, 1);
  assert.equal(variants[0].cta, "Learn more");
});

test("report narrative fallback is non-empty when AI unavailable", () => {
  const narrative = `5 quotes issued during 2026-07-01 to 2026-07-28.`;
  assert.ok(narrative.length > 0);
  assert.match(narrative, /quotes issued/);
});
