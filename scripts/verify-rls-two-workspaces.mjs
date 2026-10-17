import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TEST_PASSWORD = "TestPassword123!";

const USERS = [
  { id: "11d5bf05-6bb9-439f-a127-4b8d53fe474c", email: "user-00000000-0000-0000-0000-000000000001@test.local", orgId: "00000000-0000-0000-0000-000000000001", role: "owner" },
  { id: "04bfc24b-6fec-4913-8e8b-e2622f88bf1d", email: "user-00000000-0000-0000-0000-000000000002@test.local", orgId: "00000000-0000-0000-0000-000000000001", role: "admin" },
  { id: "08a1cfd1-7f09-494f-87e2-613f645b141f", email: "user-00000000-0000-0000-0000-000000000003@test.local", orgId: "00000000-0000-0000-0000-000000000001", role: "manager" },
  { id: "8e1e1d8c-7c1d-48f9-b370-a63d37a3f715", email: "user-00000000-0000-0000-0000-000000000004@test.local", orgId: "00000000-0000-0000-0000-000000000001", role: "sales_rep" },
  { id: "158a3b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c", email: "user-00000000-0000-0000-0000-000000000009@test.local", orgId: "00000000-0000-0000-0000-000000000001", role: "viewer" },
  { id: "9bb21c1a-a1ad-46e1-812e-ad5f8db7f0a1", email: "user-00000000-0000-0000-0000-000000000005@test.local", orgId: "570e6c84-6229-4f3a-b792-dd4ef352af53", role: "owner" },
  { id: "1479c99d-b0a8-424c-acb5-6ab4cf77560b", email: "user-00000000-0000-0000-0000-000000000006@test.local", orgId: "570e6c84-6229-4f3a-b792-dd4ef352af53", role: "admin" },
  { id: "255d4ec5-bbb6-4738-82f2-d59651c5f4a2", email: "user-00000000-0000-0000-0000-000000000007@test.local", orgId: "570e6c84-6229-4f3a-b792-dd4ef352af53", role: "manager" },
  { id: "4de40abc-4c09-4d18-9be8-ca33fad3f318", email: "user-00000000-0000-0000-0000-000000000008@test.local", orgId: "570e6c84-6229-4f3a-b792-dd4ef352af53", role: "sales_rep" },
  { id: "6a7b8c9d-0e1f-2a3b-4c5d-6e7f8a9b0c1d", email: "user-00000000-0000-0000-0000-000000000010@test.local", orgId: "570e6c84-6229-4f3a-b792-dd4ef352af53", role: "viewer" },
];

const PERMISSIONS = [
  "manage_members", "manage_billing", "manage_workspace", "review_ai",
  "manage_pipeline", "run_ai", "import_data", "edit_crm", "view_crm",
];

const TABLES = ["ai_runs", "ai_approval_requests", "import_jobs", "notifications"];

function fail(m, d) { const e = new Error(m); if (d) e.details = d; throw e; }
function reqEnv(n) { const v = process.env[n]?.trim(); if (!v) fail(`Missing ${n}`); return v; }
function client(u, k) { return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); }
async function ensureUser(a, e, id) {
  try { await a.auth.admin.updateUserById(id, { password: TEST_PASSWORD, email_confirm: true }); }
  catch { try { await a.auth.admin.createUser({ id, email: e, password: TEST_PASSWORD, email_confirm: true }); } catch (err) { console.log(`  Warning: create ${e}: ${err.message}`); } }
}
async function doSignIn(c, e) {
  const { data, error } = await c.auth.signInWithPassword({ email: e, password: TEST_PASSWORD });
  if (error || !data.user) fail(`Sign-in failed ${e}`, error?.message);
  return data.user.id;
}

let passed = 0, failed = 0;
function t(name, ok, d) { if (ok) { passed++; console.log(`  ? ${name}: ${d}`); } else { failed++; console.log(`  ? ${name}: ${d}`); } }

async function main() {
  const url = "http://localhost:56431";
  const anonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // At least two independent workspaces are required for cross-workspace isolation testing
  const admin = client(url, serviceKey);
  const anon = client(url, anonKey);

  console.log("Creating users in GoTrue...");
  for (const u of USERS) await ensureUser(admin, u.email, u.id);
  console.log(`  ${USERS.length} users ready`);

  const subs = [];
  for (const u of USERS) {
    const uid = await doSignIn(anon, u.email);
    subs.push({ ...u, userId: uid, c: client(url, anonKey) });
  }
  console.log(`  ${subs.length} authenticated`);

  console.log("\nRunning RLS tests...");
  for (const s of subs) {
    const fo = USERS.find(u => u.orgId !== s.orgId)?.orgId;
    const { data: oq, error: oe } = await s.c.from("quotes").select("id, organization_id, quote_number").eq("organization_id", s.orgId);
    const oo = oq && oq.every(q => q.organization_id === s.orgId);
    t(`quotes read: ${s.role}@${s.orgId.slice(-8)} own org only`, !oe && oo, `${oq?.length ?? 0} rows`);

    const { data: aq, error: ae } = await s.c.from("quotes").select("id, organization_id, quote_number");
    const leak = aq && aq.some(q => q.organization_id !== s.orgId);
    if (leak) fail("Cross-workspace data exposure detected", { user: s.role, leakedTo: fo });
    t(`quotes read: ${s.role}@${s.orgId.slice(-8)} no leak`, !ae && !leak, `${aq?.length ?? 0} visible`);

    const cw = ["owner", "admin", "manager", "sales_rep"].includes(s.role);
    const tid = crypto.randomUUID();
    const { error: we } = await s.c.from("quotes").insert({ id: tid, organization_id: s.orgId, quote_number: `RLS-WRITE-${s.id.slice(-8)}`, issue_date: now, expiry_date: exp, status: "draft", currency: "TRY", valid_until: exp, grand_total: 0 });
    const ws = !we;
    if (cw && !ws) fail("Cross-workspace import write unexpectedly succeeded", { user: s.role });
    if (!cw && ws) fail("Viewer import write unexpectedly succeeded", { user: s.role });
    t(`quotes write: ${s.role}@${s.orgId.slice(-8)} (expect ${cw ? "allow" : "deny"})`, cw === ws, ws ? "allowed" : "denied");
    if (ws) await s.c.from("quotes").delete().eq("id", tid);
    await admin.from("import_jobs").delete().eq("id", tid);
  }

  console.log("\nCleaning up...");
  for (const o of [...new Set(USERS.map(u => u.orgId))]) {
    try { await admin.from("quotes").delete().eq("organization_id", o).like("quote_number", "RLS-%"); } catch {}
  }
  for (const u of USERS) { try { await admin.auth.admin.deleteUser(u.id); } catch {} }

  console.log("\n" + "=".repeat(50));
  console.log(`RLS Tests: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

await main().catch(err => { console.error("Fatal:", err.message); process.exitCode = 1; });
  console.log("Setting memberships...");
  for (const u of USERS) {
    try { await admin.from("organization_members").upsert({ user_id: u.id, organization_id: u.orgId, role: u.role }, { onConflict: "organization_id,user_id" }); } catch {}
  }

  const now = new Date().toISOString().split("T")[0];
  const exp = new Date(Date.now() + 86400000 * 30).toISOString().split("T")[0];
  const orgs = [...new Set(USERS.map(u => u.orgId))];
  for (const o of orgs) {
    try { await admin.from("quotes").upsert({ id: crypto.randomUUID(), organization_id: o, quote_number: `RLS-TEST-${o.slice(-8)}`, issue_date: now, expiry_date: exp, status: "draft", currency: "TRY", valid_until: exp, grand_total: 1000 }); } catch {}
  }
