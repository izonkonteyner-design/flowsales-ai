import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("redirect() is not caught by broad try/catch in quote actions", () => {
  const filePath = path.join(process.cwd(), "app/(app)/quotes/actions.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  const functions = [
    "createQuoteAction",
    "updateQuoteAction",
    "updateQuoteStatusAction",
    "duplicateQuoteAction",
    "deleteQuoteAction",
  ];

  for (const fn of functions) {
    const fnStartIndex = content.indexOf(`export async function ${fn}`);
    assert.ok(fnStartIndex !== -1, `Function ${fn} not found`);

    const nextFnIndex = content.indexOf("export async function", fnStartIndex + 20);
    const fnBody = content.slice(
      fnStartIndex,
      nextFnIndex === -1 ? content.length : nextFnIndex
    );

    const catchIndex = fnBody.lastIndexOf("} catch (error) {");
    assert.ok(catchIndex !== -1, `No catch block found in ${fn}`);
    
    const catchEndIndex = fnBody.indexOf("}", catchIndex + 17);
    const postCatchBody = fnBody.slice(catchEndIndex);

    assert.ok(
      postCatchBody.includes("redirect("),
      `Success redirect must be outside the try/catch in ${fn}`
    );
    
    const tryBlock = fnBody.slice(fnBody.indexOf("try {"), catchIndex);
    assert.ok(
      !tryBlock.includes("redirect("),
      `redirect() must not be inside try block in ${fn} to avoid swallowing NEXT_REDIRECT`
    );
  }
});
