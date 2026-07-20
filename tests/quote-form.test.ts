import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("quote form uses stable crypto.randomUUID() instead of array length for new line keys", () => {
  const content = readFileSync(join(process.cwd(), "components/quotes/quote-form.tsx"), "utf-8");
  
  // Verify the bug is not present
  assert.strictEqual(
    content.includes("line-${current.length + 1}"),
    false,
    "quote-form.tsx must not use array length to generate line keys, as it causes React duplicate key insertBefore crashes on deletion."
  );

  // Verify the fix is present
  assert.ok(
    content.includes("crypto.randomUUID()"),
    "quote-form.tsx should use crypto.randomUUID() for new line generation to ensure key stability."
  );
});
