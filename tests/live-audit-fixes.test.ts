import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("revenue intelligence reads structured signals from the deployed qualification schema", async () => {
  const code = await source("server/services/revenue-intelligence-v4.ts");
  assert.match(code, /summary,signals,missing_information/);
  assert.doesNotMatch(code, /summary,objections,missing_information,product_interest/);
  assert.match(code, /qualificationSignals\(row\.signals\)/);
  assert.match(code, /select\("id,full_name,email,phone,created_at"\)/);
  assert.doesNotMatch(code, /select\("id,name,email,phone,created_at"\)/);
  assert.match(code, /const customers = error \? \[\] : customerRows \|\| \[\]/);
});

test("legacy team route cannot expose hard-coded demo members", async () => {
  const code = await source("app/(app)/team/page.tsx");
  assert.match(code, /redirect\("\/settings\/members"\)/);
  assert.doesNotMatch(code, /getTeamMembers|Selin Kaya/);
});

test("product form uploads images directly without Server Action body payloads", async () => {
  const [form, service, actions] = await Promise.all([
    source("components/products/product-form.tsx"),
    source("server/services/products.ts"),
    source("app/(app)/products/actions.ts"),
  ]);
  assert.match(form, /getSupabaseBrowserClient/);
  assert.match(form, /storage\.from\("workspace-assets"\)\.upload/);
  assert.doesNotMatch(form, /name="main_image_file"/);
  assert.doesNotMatch(form, /name="gallery_image_files"/);
  assert.match(service, /MAX_PRODUCT_IMAGE_SIZE = 5 \* 1024 \* 1024/);
  assert.match(service, /image\/png[\s\S]*image\/jpeg[\s\S]*image\/webp/);
  assert.doesNotMatch(actions, /uploadProductImage/);
});

test("product form presents Turkish lira as TL while persisting TRY", async () => {
  const form = await source("components/products/product-form.tsx");
  assert.match(form, /TRY: "TL"/);
  assert.match(form, /<option key=\{currency\} value=\{currency\}>/);
});

test("lead form presents Turkish lira as TL while persisting TRY", async () => {
  const form = await source("components/leads/lead-form.tsx");
  assert.match(form, /TRY: "TL"/);
  assert.match(form, /<option key=\{currency\} value=\{currency\}>/);
});

test("language, lead search and voice provider controls reflect their actual behavior", async () => {
  const [locale, shell, voice] = await Promise.all([
    source("components/shared/locale-switcher.tsx"),
    source("components/layout/app-shell.tsx"),
    source("app/(app)/settings/integrations/voice/page.tsx"),
  ]);
  assert.match(locale, /window\.location\.reload\(\)/);
  assert.match(shell, /name="search" type="search" required minLength=\{1\}/);
  assert.match(voice, /value="telnyx">Telnyx \(FlowSales AI Voice\)/);
});

test("lead identity and WhatsApp signup use production-safe targets", async () => {
  const [migration, whatsapp, revenue, operations] = await Promise.all([
    source("supabase/migrations/0052_contact_identity_guard_fix.sql"),
    source("components/settings/whatsapp-connect-button.tsx"),
    source("server/services/revenue-intelligence-v4.ts"),
    source("server/services/sales-operations-v5.ts"),
  ]);
  assert.match(migration, /from public\.contacts c/);
  assert.doesNotMatch(migration, /from public\.customers c/);
  assert.doesNotMatch(whatsapp, /FB\.login\(\s*async/);
  assert.match(whatsapp, /void completeEmbeddedSignup\(response\)/);
  assert.match(revenue, /\.from\("contacts"\)/);
  assert.match(operations, /admin\.from\("contacts"\)/);
});
