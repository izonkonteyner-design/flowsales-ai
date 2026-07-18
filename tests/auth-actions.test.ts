import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const testsDir = dirname(fileURLToPath(import.meta.url));
const actionsPath = join(testsDir, "..", "app", "(auth)", "actions.ts");
const source = readFileSync(actionsPath, "utf8");

function getActionBlock(actionName: string) {
  const start = source.indexOf(`export async function ${actionName}`);
  assert.notEqual(start, -1, `${actionName} not found`);

  const nextExportIndex = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExportIndex === -1 ? undefined : nextExportIndex);
}

test("auth actions place redirect control flow after the failure handlers", () => {
  const loginBlock = getActionBlock("loginAction");
  assert.match(loginBlock, /let redirectPath = "";/);
  assert.match(loginBlock, /redirectPath = buildAuthRedirectPath\(input\.next\);/);
  assert.doesNotMatch(loginBlock, /redirect\(buildAuthRedirectPath\(input\.next\)\);/);
  assert.ok(loginBlock.indexOf("} catch (error) {") < loginBlock.indexOf("redirect(redirectPath);"));

  const registerBlock = getActionBlock("registerAction");
  assert.match(registerBlock, /let redirectPath = "";/);
  assert.match(registerBlock, /let confirmationState: AuthActionState \| null = null;/);
  assert.match(registerBlock, /confirmationState = createAuthActionState\("Check your email to confirm your account\.", \{\}, true\);/);
  assert.match(registerBlock, /return confirmationState \?\? createAuthActionState\("Check your email to confirm your account\.", \{\}, true\);/);
  assert.doesNotMatch(registerBlock, /redirect\(buildAuthRedirectPath\(input\.next\)\);/);
  assert.ok(registerBlock.indexOf("} catch (error) {") < registerBlock.indexOf("redirect(redirectPath);"));

  const bootstrapBlock = getActionBlock("bootstrapWorkspaceAction");
  assert.match(bootstrapBlock, /let redirectPath = "";/);
  assert.match(bootstrapBlock, /redirectPath = buildAuthRedirectPath\(input\.next\);/);
  assert.doesNotMatch(bootstrapBlock, /redirect\(buildAuthRedirectPath\(input\.next\)\);/);
  assert.ok(bootstrapBlock.indexOf("} catch (error) {") < bootstrapBlock.indexOf("redirect(redirectPath);"));

  const resetBlock = getActionBlock("resetPasswordAction");
  assert.match(resetBlock, /let redirectPath = "";/);
  assert.match(resetBlock, /redirectPath = buildAuthRedirectPath\(input\.next\);/);
  assert.doesNotMatch(resetBlock, /redirect\(buildAuthRedirectPath\(input\.next\)\);/);
  assert.ok(resetBlock.indexOf("} catch (error) {") < resetBlock.indexOf("redirect(redirectPath);"));
});
