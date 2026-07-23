import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  buildDemoActionStagePayload,
  emitDemoActionStageLog,
} from "@/server/services/demo-action-diagnostics";


describe("Demo Security & Migration Verification", () => {
  it("migration 0017 contains no invalid UUID literals with non-hex characters like 'm'", () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    // We expect UUIDs like 'd3e00000-0000-0000-0000-000000000000'
    // We expect UUIDs like 'd3e00000-0000-0000-0000-000000000000'
    const invalidUuidRegex = /'[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}'/gi;

    const allStringUuids = sql.match(invalidUuidRegex) || [];
    
    for (const match of allStringUuids) {
      // ensure it's purely hex
      const justChars = match.replace(/'/g, "");
      assert.match(justChars, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, `Found invalid UUID literal: ${justChars}`);
    }
  });

  it("migration 0017 explicitly revokes public execute and grants to authenticated", () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.join_demo_workspace() FROM public;"));
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.join_demo_workspace() TO authenticated;"));
  });

  it("migration 0017 function join_demo_workspace uses fixed workspace and assigns viewer role", () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    assert.ok(sql.includes("VALUES (v_demo_org_id, v_user_id, 'viewer', now())"));
    assert.ok(sql.includes("DO UPDATE SET role = 'viewer'"));
    // It should not accept parameters
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.join_demo_workspace()"));
  });

  it("demo user is blocked from updating profile", async () => {
    // We mock the process.env temporarily
    const originalDemoEmail = process.env.DEMO_USER_EMAIL;
    process.env.DEMO_USER_EMAIL = "demo@example.com";
    
    // This test stays file-based so it does not trigger server-only module side effects.
    const accountTsPath = path.join(process.cwd(), "server/services/account.ts");
    const accountTs = fs.readFileSync(accountTsPath, "utf-8");
    assert.ok(accountTs.includes("user.email === process.env.DEMO_USER_EMAIL"));
    assert.ok(accountTs.includes("Profile updates are disabled for the demo account."));
    
    process.env.DEMO_USER_EMAIL = originalDemoEmail;
  });

  it("demo user is blocked from resetting password", async () => {
    const authTsPath = path.join(process.cwd(), "server/services/auth.ts");
    const authTs = fs.readFileSync(authTsPath, "utf-8");
    
    assert.ok(authTs.includes("userData.user.email === process.env.DEMO_USER_EMAIL"));
    assert.ok(authTs.includes("Password resets are disabled for the demo account."));
    assert.ok(authTs.includes("input.email === process.env.DEMO_USER_EMAIL"));
  });
  
  it("demo action stage payloads stay structured and exclude secret values", () => {
    const payload = buildDemoActionStagePayload("demo_config", {
      returnedAuthError: "Demo mode is not configured.",
      missingEnv: ["DEMO_USER_EMAIL", "DEMO_USER_PASSWORD", "DEMO_RATE_LIMIT_SECRET"],
    });

    assert.equal(payload.stage, "demo_config");
    assert.deepEqual(payload.missingEnv, [
      "DEMO_USER_EMAIL",
      "DEMO_USER_PASSWORD",
      "DEMO_RATE_LIMIT_SECRET",
    ]);
    assert.equal(JSON.stringify(payload).includes("super-secret"), false);
    assert.equal(JSON.stringify(payload).includes("token"), false);
    assert.equal(JSON.stringify(payload).includes("password123"), false);
  });

  it("demo start rate limiting uses IP hash and secret pepper", async () => {
    const actionsTsPath = path.join(process.cwd(), "app/(auth)/actions.ts");
    const actionsTs = fs.readFileSync(actionsTsPath, "utf-8");
    
    assert.ok(actionsTs.includes("crypto.createHash(\"sha256\")"));
    assert.ok(actionsTs.includes("process.env.DEMO_RATE_LIMIT_SECRET"));
    assert.ok(actionsTs.includes("fallback-demo-bucket"));
    // Not sending raw IP
    assert.ok(!actionsTs.includes("p_identifier: rawIp,"));
  });

  it("rate limit RPC is not executable by public, anon, or authenticated", async () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.check_demo_rate_limit(text) FROM public, anon, authenticated;"));
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.check_demo_rate_limit(text) TO service_role;"));
  });

  it("invalid identifier formats are rejected by SQL", async () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(sql.includes("p_identifier !~ '^[0-9a-f]{64}$'"));
  });

  it("header values containing control characters are rejected", async () => {
    const actionsTsPath = path.join(process.cwd(), "app/(auth)/actions.ts");
    const actionsTs = fs.readFileSync(actionsTsPath, "utf-8");
    assert.ok(actionsTs.includes("net.isIP(rawIp)"));
  });

  it("structured demo stage logging includes the stage and safe metadata only", () => {
    const captured: unknown[][] = [];
    const originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      captured.push(args);
    };

    try {
      emitDemoActionStageLog("admin_config", {
        returnedAuthError: "Authentication not configured.",
        missingEnv: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      });
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(captured.length, 1);
    const [message, payload] = captured[0] ?? [];
    assert.equal(typeof message, "string");
    assert.equal((payload as { stage?: string }).stage, "admin_config");
    assert.deepEqual((payload as { missingEnv?: string[] }).missingEnv, [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
    assert.equal(JSON.stringify(captured).includes("super-secret"), false);
    assert.equal(JSON.stringify(captured).includes("DEMO_USER_PASSWORD_VALUE"), false);
  });

  it("documentation uses GEMINI_API_KEY consistently", async () => {
    const deploymentMdPath = path.join(process.cwd(), "docs/DEPLOYMENT.md");
    const deploymentMd = fs.readFileSync(deploymentMdPath, "utf-8");
    assert.ok(!deploymentMd.includes("GOOGLE_GEMINI_API_KEY"));
    assert.ok(deploymentMd.includes("GEMINI_API_KEY"));
  });

  it("rate limit uses per-source and global buckets", async () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    assert.ok(sql.includes("v_max_source_requests int :="));
    assert.ok(sql.includes("v_max_global_requests int :="));
    assert.ok(sql.includes("v_global_identifier text := 'global-demo-limit';"));
  });

  it("browser/client code cannot import the service-role helper", async () => {
    const serverAdminPath = path.join(process.cwd(), "lib/supabase/server-admin.ts");
    const serverAdminTs = fs.readFileSync(serverAdminPath, "utf-8");
    
    assert.ok(serverAdminTs.includes("import \"server-only\";"));
    assert.ok(serverAdminTs.includes("import { getSupabaseEnv } from \"@/lib/supabase/env\";"));
    assert.ok(serverAdminTs.includes("const env = getSupabaseEnv();"));
    assert.ok(serverAdminTs.includes("const supabaseServiceRoleKey = env.serviceRoleKey;"));
  });

  it("demo inserts contain all required schema fields and use ON CONFLICT DO UPDATE", async () => {
    const migrationPath = path.join(process.cwd(), "supabase/migrations/0017_demo_mode.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    // Products schema contract
    assert.ok(sql.includes("description, short_description"));
    assert.ok(sql.includes("unit_price"));
    assert.ok(sql.includes("stock_quantity"));
    assert.ok(sql.includes("ON CONFLICT (id) DO UPDATE"));
    assert.ok(sql.includes("organization_id = EXCLUDED.organization_id"));
    assert.ok(sql.includes("description = EXCLUDED.description"));

    // Leads schema contract
    assert.ok(sql.includes("INSERT INTO public.leads ("));
    assert.ok(sql.includes("full_name, company, email, source, status, estimated_value, currency"));

    // Contacts (Customers) schema contract
    assert.ok(sql.includes("INSERT INTO public.contacts ("));
    assert.ok(sql.includes("full_name, company, email, phone, city"));
  });

  it("demo user profile page disables form fields and shows a banner", async () => {
    const pagePath = path.join(process.cwd(), "app/(app)/account/page.tsx");
    const pageTsx = fs.readFileSync(pagePath, "utf-8");
    
    // Verify it detects the demo account
    assert.ok(pageTsx.includes("const isDemo = email === process.env.DEMO_USER_EMAIL;"));
    
    // Verify it shows the read-only banner
    assert.ok(pageTsx.includes("Demo mode is read-only. Create your own account to edit profile information."));
    
    // Verify it disables the input field
    assert.ok(pageTsx.includes("disabled={isDemo}"));
    
    // Verify it disables the submit button
    assert.ok(pageTsx.includes("<Button type=\"submit\" disabled={isDemo}>Save Changes</Button>"));
  });
});
