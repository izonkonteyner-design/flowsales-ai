import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKTREE = process.cwd();

describe("Database Migration Contracts & Integrity Tests", () => {
  const m27Path = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
  const m30Path = path.join(WORKTREE, "supabase/migrations/0030_whatsapp_code_idempotency.sql");
  const m31Path = path.join(WORKTREE, "supabase/migrations/0031_whatsapp_connection_integrity.sql");
  const repoPath = path.join(WORKTREE, "server/repositories/supabase/whatsapp-connections.ts");

  test("Migration sequence continues with 0031_whatsapp_connection_integrity.sql", () => {
    assert.ok(fs.existsSync(m27Path), "0027 migration must exist");
    assert.ok(fs.existsSync(m30Path), "0030 migration must exist");
    assert.ok(fs.existsSync(m31Path), "0031 migration must exist");

    const m31Content = fs.readFileSync(m31Path, "utf-8");
    assert.ok(m31Content.includes("'0031'"), "0031 migration must register version 0031 in deployment_migrations");
  });

  test("channel_accounts repository columns and onConflict match 0027 migration unique constraint", () => {
    const m27Content = fs.readFileSync(m27Path, "utf-8");
    const repoContent = fs.readFileSync(repoPath, "utf-8");

    // Verify 0027 unique constraint on channel_accounts
    assert.ok(
      m27Content.includes("unique (organization_id, provider, external_id)"),
      "0027 migration must define unique (organization_id, provider, external_id) on channel_accounts"
    );

    // Verify repository onConflict target
    assert.ok(
      repoContent.includes("onConflict: 'organization_id,provider,external_id'"),
      "Repository upsertWhatsAppAccount must use onConflict: 'organization_id,provider,external_id'"
    );

    // Verify repository columns use external_id, display_name, metadata (no legacy columns)
    assert.ok(repoContent.includes("external_id: accountInfo.phoneNumberId"), "Repository must populate external_id");
    assert.ok(!repoContent.includes("account_id: accountInfo"), "Repository must not use legacy account_id column");
    assert.ok(!repoContent.includes("account_name:"), "Repository must not use legacy account_name column");
  });

  test("integration_tokens repository onConflict matches 0027 migration unique constraint", () => {
    const m27Content = fs.readFileSync(m27Path, "utf-8");
    const repoContent = fs.readFileSync(repoPath, "utf-8");

    // Verify 0027 unique constraint on integration_tokens
    assert.ok(
      m27Content.includes("constraint integration_tokens_connection_unique unique (connection_id)"),
      "0027 migration must define unique (connection_id) on integration_tokens"
    );

    // Verify repository onConflict target matches connection_id only
    assert.ok(
      repoContent.includes("onConflict: 'connection_id'"),
      "Repository storeWhatsAppTokens must use onConflict: 'connection_id'"
    );
    assert.ok(
      !repoContent.includes("onConflict: 'organization_id,connection_id'"),
      "Repository storeWhatsAppTokens must not use incorrect multi-column onConflict target"
    );
  });

  test("oauth_authorization_codes table has RLS enabled in 0030 migration", () => {
    const m30Content = fs.readFileSync(m30Path, "utf-8");
    assert.ok(
      m30Content.includes("alter table public.oauth_authorization_codes enable row level security;"),
      "oauth_authorization_codes table must have RLS enabled"
    );
  });

  test("consume_whatsapp_authorization_code RPC in 0031 migration is SECURITY DEFINER with strict search_path and permissions", () => {
    const m31Content = fs.readFileSync(m31Path, "utf-8");

    assert.ok(m31Content.includes("create or replace function public.consume_whatsapp_authorization_code"), "0031 must create consume_whatsapp_authorization_code function");
    assert.ok(m31Content.includes("security definer"), "consume_whatsapp_authorization_code must be SECURITY DEFINER");
    assert.ok(m31Content.includes("set search_path = public, pg_catalog"), "consume_whatsapp_authorization_code must set search_path = public, pg_catalog");
    assert.ok(m31Content.includes("revoke all on function public.consume_whatsapp_authorization_code"), "RPC must revoke execution from public");
    assert.ok(m31Content.includes("grant execute on function public.consume_whatsapp_authorization_code"), "RPC must grant execution to service_role");
  });

  test("distributed rate limiting table and RPC in 0031 migration are secure and service_role only", () => {
    const m31Content = fs.readFileSync(m31Path, "utf-8");

    assert.ok(m31Content.includes("create table if not exists public.rate_limits"), "0031 must create rate_limits table");
    assert.ok(m31Content.includes("alter table public.rate_limits enable row level security;"), "rate_limits must have RLS enabled");
    assert.ok(m31Content.includes("create or replace function public.check_distributed_rate_limit"), "0031 must create check_distributed_rate_limit function");
    assert.ok(m31Content.includes("revoke all on function public.check_distributed_rate_limit"), "check_distributed_rate_limit must revoke execution from public");
    assert.ok(m31Content.includes("grant execute on function public.check_distributed_rate_limit"), "check_distributed_rate_limit must grant execution to service_role");
  });
});
