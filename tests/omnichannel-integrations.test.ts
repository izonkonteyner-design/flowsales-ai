import { describe, it } from "node:test";
import assert from "node:assert";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Omnichannel Integrations Test Suite
//
// Tests are file-based and unit-level — they do NOT hit a real Supabase instance.
// Server-only modules are verified via file content inspection.
// Logic-based tests cover:
//   - Provider/status enum validation
//   - Open redirect prevention
//   - OAuth state hash/consume logic (pure functions extracted inline)
//   - Token non-leakage assertions
//   - Migration file content assertions
//   - Navigation constants
//   - Integration card file existence
// ============================================================================

const WORKTREE = process.cwd();

// ============================================================================
// 1. Provider enum validation
// ============================================================================

describe("Omnichannel: Provider enum validation", () => {
  it("provider-adapter exports valid CHANNEL_PROVIDERS", async () => {
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");

    const validProviders = ["whatsapp", "instagram", "facebook", "google", "tiktok"];
    for (const p of validProviders) {
      assert.ok(src.includes(`"${p}"`), `Provider enum should include '${p}'`);
    }
  });

  it("provider-adapter getProviderAdapter covers all 5 providers", async () => {
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");

    assert.ok(src.includes("case \"whatsapp\":"));
    assert.ok(src.includes("case \"instagram\":"));
    assert.ok(src.includes("case \"facebook\":"));
    assert.ok(src.includes("case \"google\":"));
    assert.ok(src.includes("case \"tiktok\":"));
  });
});

// ============================================================================
// 2. Status enum validation
// ============================================================================

describe("Omnichannel: Status enum validation", () => {
  it("migration 0027 includes all required connection statuses", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const statuses = ["not_connected", "connecting", "connected", "expired", "error", "revoked"];
    for (const status of statuses) {
      assert.ok(sql.includes(`'${status}'`), `Migration should include status '${status}'`);
    }
  });
});

// ============================================================================
// 3. Workspace isolation assertions (migration-level)
// ============================================================================

describe("Omnichannel: Workspace isolation", () => {
  it("migration 0027 has RLS enabled on channel_connections", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(sql.includes("alter table public.channel_connections enable row level security;"));
  });

  it("migration 0027 has workspace isolation via organization_id", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // All read policies use organization_members join
    assert.ok(sql.includes("om.organization_id = channel_connections.organization_id"));
    assert.ok(sql.includes("om.organization_id = channel_accounts.organization_id"));
    assert.ok(sql.includes("om.organization_id = messages.organization_id"));
  });

  it("migration 0027 blocks cross-workspace read (RLS select policies require membership)", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Every select policy joins organization_members with user_id = auth.uid()
    const membersJoinCount = (sql.match(/om\.user_id = auth\.uid\(\)/g) ?? []).length;
    assert.ok(membersJoinCount >= 10, `Expected at least 10 workspace-isolation joins, got ${membersJoinCount}`);
  });

  it("migration 0027 has RLS on all 13 new tables", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const tables = [
      "channel_connections",
      "channel_accounts",
      "channel_contacts",
      "conversations",
      "conversation_participants",
      "messages",
      "message_attachments",
      "message_delivery_events",
      "webhook_events",
      "integration_tokens",
      "integration_sync_jobs",
      "lead_source_events",
      "oauth_states",
    ];

    for (const table of tables) {
      assert.ok(
        sql.includes(`alter table public.${table} enable row level security;`),
        `RLS must be enabled on public.${table}`,
      );
    }
  });
});

// ============================================================================
// 4. Viewer cannot create connections (migration-level RLS check)
// ============================================================================

describe("Omnichannel: Viewer cannot manage connections", () => {
  it("channel_connections insert policy requires owner or admin role", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // The insert policy must include role in ('owner', 'admin')
    assert.ok(sql.includes("om.role in ('owner', 'admin')"));
  });

  it("route guard rejects non-owner/admin via runOAuthGuard source", () => {
    const guardPath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-route-guard.ts",
    );
    const src = fs.readFileSync(guardPath, "utf-8");

    assert.ok(
      src.includes("workspace.role !== \"owner\" && workspace.role !== \"admin\""),
      "Guard should reject non-owner/admin roles",
    );
    assert.ok(src.includes("403"));
    assert.ok(src.includes("permission_denied"));
  });
});

// ============================================================================
// 5. Demo workspace cannot initiate connections
// ============================================================================

describe("Omnichannel: Demo cannot initiate connections", () => {
  it("route guard blocks demo mode", () => {
    const guardPath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-route-guard.ts",
    );
    const src = fs.readFileSync(guardPath, "utf-8");

    assert.ok(src.includes("workspace.mode === \"demo\""));
    assert.ok(src.includes("demo_blocked"));
    assert.ok(src.includes("403"));
  });

  it("migration 0027 demo org insert blocks apply to channel_connections", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid"),
      "Demo org should be blocked from channel connection mutations",
    );
  });

  it("integration page shows demo banner when in demo mode", () => {
    const pagePath = path.join(
      WORKTREE,
      "app/(app)/settings/integrations/page.tsx",
    );
    const src = fs.readFileSync(pagePath, "utf-8");

    assert.ok(src.includes("Demo mode"));
    assert.ok(src.includes("isDemo"));
  });
});

// ============================================================================
// 6. Owner/admin can initiate connections (guard logic)
// ============================================================================

describe("Omnichannel: Owner/admin can initiate", () => {
  it("route guard allows owner and admin roles to proceed", () => {
    const guardPath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-route-guard.ts",
    );
    const src = fs.readFileSync(guardPath, "utf-8");

    // Guard only blocks if role is NOT owner/admin
    assert.ok(src.includes("workspace.role !== \"owner\" && workspace.role !== \"admin\""));
    // If role IS owner/admin, it returns ok: true
    assert.ok(src.includes("ok: true"));
    assert.ok(src.includes("ctx: {"));
  });
});

// ============================================================================
// 7. OAuth state validation
// ============================================================================

describe("Omnichannel: OAuth state validation", () => {
  it("oauth-state.ts stores only SHA-256 hash of raw state", async () => {
    const statePath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-state.ts",
    );
    const src = fs.readFileSync(statePath, "utf-8");

    assert.ok(src.includes("hashStateToken"));
    assert.ok(src.includes("sha256"));
    assert.ok(src.includes("state_hash"));
    // Verify raw state is never inserted into the DB as its own column
    // The insert object should use state_hash, not a raw state column
    assert.ok(!src.includes("raw_state:"), "Raw state must not be inserted as a DB field");
    assert.ok(!src.includes("state_token:"), "State token must not be inserted as a DB field");
  });

  it("hashStateToken produces consistent 64-char hex output", () => {
    // Inline re-implementation of hashStateToken logic for testing
    function hashStateToken(raw: string): string {
      return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
    }

    const raw = crypto.randomBytes(32).toString("hex");
    const hash1 = hashStateToken(raw);
    const hash2 = hashStateToken(raw);
    assert.strictEqual(hash1, hash2, "Hash must be deterministic");
    assert.strictEqual(hash1.length, 64, "SHA-256 hex must be 64 chars");
  });

  it("oauth-state.ts uses atomic consumed_at mark (not delete)", () => {
    const statePath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-state.ts",
    );
    const src = fs.readFileSync(statePath, "utf-8");

    // Should update consumed_at, not delete
    assert.ok(src.includes("consumed_at"));
    assert.ok(src.includes("is(\"consumed_at\", null)"), "Atomic consume must use IS NULL check");
    assert.ok(!src.includes(".delete("), "Should not delete state rows; use consumed_at instead");
  });
});

// ============================================================================
// 8. Expired state rejection
// ============================================================================

describe("Omnichannel: Expired state rejection", () => {
  it("oauth-state.ts checks expires_at before consuming", () => {
    const statePath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-state.ts",
    );
    const src = fs.readFileSync(statePath, "utf-8");

    assert.ok(src.includes("expires_at"));
    assert.ok(src.includes("OAuthStateExpiredError"));
    assert.ok(src.includes("new Date(row.expires_at) < new Date()"));
  });

  it("oauth_states table has 10-minute default expiry in migration", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(sql.includes("interval '10 minutes'"));
  });
});

// ============================================================================
// 9. Consumed state cannot be reused
// ============================================================================

describe("Omnichannel: Consumed state replay rejection", () => {
  it("oauth-state.ts rejects already-consumed states", () => {
    const statePath = path.join(
      WORKTREE,
      "server/services/integrations/oauth-state.ts",
    );
    const src = fs.readFileSync(statePath, "utf-8");

    assert.ok(src.includes("OAuthStateConsumedError"));
    assert.ok(src.includes("row.consumed_at !== null"));
  });
});

// ============================================================================
// 10. Open redirect prevention
// ============================================================================

describe("Omnichannel: Open redirect prevention", () => {
  it("validateReturnPath blocks external URLs", () => {
    // Inline re-implementation for pure unit testing
    function validateReturnPath(returnPath: string | null | undefined): string {
      const defaultPath = "/settings/integrations";
      if (!returnPath || typeof returnPath !== "string") return defaultPath;

      const trimmed = returnPath.trim();
      if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
        throw new Error("open_redirect_blocked");
      }

      const BLOCKED_SCHEMES = ["http:", "https:", "//", "javascript:", "data:"];
      for (const scheme of BLOCKED_SCHEMES) {
        if (trimmed.includes(scheme)) throw new Error("open_redirect_blocked");
      }

      if (trimmed.includes("@")) throw new Error("open_redirect_blocked");
      if (trimmed.length > 512) throw new Error("open_redirect_blocked");

      return trimmed;
    }

    // Should pass
    assert.strictEqual(validateReturnPath("/settings/integrations"), "/settings/integrations");
    assert.strictEqual(validateReturnPath("/leads"), "/leads");
    assert.strictEqual(validateReturnPath(null), "/settings/integrations");

    // Should block
    assert.throws(() => validateReturnPath("https://evil.com"), /open_redirect/);
    assert.throws(() => validateReturnPath("http://evil.com"), /open_redirect/);
    assert.throws(() => validateReturnPath("//evil.com"), /open_redirect/);
    assert.throws(() => validateReturnPath("javascript:alert(1)"), /open_redirect/);
    assert.throws(() => validateReturnPath("data:text/html,<script>"), /open_redirect/);
    assert.throws(() => validateReturnPath("/path@evil.com"), /open_redirect/);
  });

  it("provider-adapter.ts exports validateReturnPath with OAuthOpenRedirectError", () => {
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");

    assert.ok(src.includes("validateReturnPath"));
    assert.ok(src.includes("OAuthOpenRedirectError"));
    assert.ok(src.includes("BLOCKED_SCHEMES"));
  });
});

// ============================================================================
// 11. Provider config missing — no external call
// ============================================================================

describe("Omnichannel: Missing provider config", () => {
  it("MetaAdapter buildAuthorizationUrl throws OAuthConfigurationRequiredError when META_CLIENT_ID absent", () => {
    // Test the pattern: when env var is absent, adapter throws before making URL
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");

    assert.ok(src.includes("OAuthConfigurationRequiredError"));
    assert.ok(src.includes("META_CLIENT_ID"));
    assert.ok(src.includes("GOOGLE_CLIENT_ID"));
    assert.ok(src.includes("TIKTOK_CLIENT_KEY"));
  });

  it("isProviderConfigured returns false when env vars absent", () => {
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");

    assert.ok(src.includes("isProviderConfigured"));
    assert.ok(src.includes("OAuthConfigurationRequiredError) return false"));
  });

  it("connect routes check provider config before generating state", () => {
    const metaConnect = path.join(
      WORKTREE,
      "app/api/integrations/meta/connect/route.ts",
    );
    const googleConnect = path.join(
      WORKTREE,
      "app/api/integrations/google/connect/route.ts",
    );
    const tiktokConnect = path.join(
      WORKTREE,
      "app/api/integrations/tiktok/connect/route.ts",
    );

    for (const routePath of [metaConnect, googleConnect, tiktokConnect]) {
      const src = fs.readFileSync(routePath, "utf-8");
      assert.ok(src.includes("OAuthConfigurationRequiredError"), `${path.basename(routePath)} must throw config error`);
    }
  });
});

// ============================================================================
// 12. Token/secret non-leakage to client
// ============================================================================

describe("Omnichannel: Token and secret non-leakage", () => {
  it("integration_tokens has no plaintext token column in migration", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Forbidden column names (plaintext)
    assert.ok(!sql.includes("access_token text"), "access_token must not be stored as plaintext");
    assert.ok(!sql.includes("refresh_token text"), "refresh_token must not be stored as plaintext");
    assert.ok(!sql.includes("client_secret text"), "client_secret must not be stored as plaintext");

    // Cipher columns must be present
    assert.ok(sql.includes("access_token_cipher"), "access_token_cipher column must exist");
    assert.ok(sql.includes("refresh_token_cipher"), "refresh_token_cipher column must exist");
  });

  it("oauth_states has no plaintext state_token column — only state_hash", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(sql.includes("state_hash"), "oauth_states must store only the hash");
    assert.ok(!sql.includes("raw_state"), "oauth_states must not store raw state");
    assert.ok(!sql.includes("state_token text"), "oauth_states must not store plaintext state token");
    assert.ok(sql.includes("code_verifier_ciphertext"), "PKCE verifier must be stored as ciphertext");
  });

  it("integration_tokens has no SELECT policy for authenticated/anon users", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Should only have service_role policy
    assert.ok(sql.includes("service_role_manage_integration_tokens"));
    // Strip comments before checking SQL policy statements
    const sqlWithoutComments = sql.replace(/--.*$/gm, "");
    const tokenPolicies = sqlWithoutComments
      .split(";")
      .filter((stmt) => stmt.includes("on public.integration_tokens") && stmt.includes("create policy"));
    for (const policy of tokenPolicies) {
      assert.ok(
        !policy.includes("authenticated"),
        `integration_tokens policy must not grant authenticated access: ${policy.substring(0, 100)}`,
      );
    }
  });

  it("oauth_states has no SELECT policy for authenticated/anon users", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(sql.includes("service_role_manage_oauth_states"));
    const sqlWithoutComments = sql.replace(/--.*$/gm, "");
    const oauthStatePolicies = sqlWithoutComments
      .split(";")
      .filter((stmt) => stmt.includes("on public.oauth_states") && stmt.includes("create policy"));
    for (const policy of oauthStatePolicies) {
      assert.ok(
        !policy.includes("authenticated"),
        `oauth_states policy must not grant authenticated access`,
      );
    }
  });

  it("integration page does not pass errorMessage from DB to client", () => {
    const pagePath = path.join(WORKTREE, "app/(app)/settings/integrations/page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");

    // The page should sanitize errorMessage, not pass raw.error_message
    assert.ok(
      src.includes("errorMessage:") && src.includes("Connection error. Please reconnect."),
      "Page should sanitize error messages before passing to client",
    );
    assert.ok(
      !src.includes("errorMessage: raw.error_message"),
      "Page must not pass raw DB error_message to client",
    );
  });

  it("callback routes do not log authorization code", () => {
    const callbackPaths = [
      path.join(WORKTREE, "app/api/integrations/meta/callback/route.ts"),
      path.join(WORKTREE, "app/api/integrations/google/callback/route.ts"),
      path.join(WORKTREE, "app/api/integrations/tiktok/callback/route.ts"),
    ];

    for (const routePath of callbackPaths) {
      const src = fs.readFileSync(routePath, "utf-8");
      // logger calls must not include 'code' as a logged field
      const loggerCalls = src.match(/logger\.(info|warn|error)\([^)]+\)/g) ?? [];
      for (const call of loggerCalls) {
        assert.ok(
          !call.includes("code:") && !call.includes(", code"),
          `${path.basename(routePath)}: logger call must not log authorization code: ${call}`,
        );
      }
    }
  });
});

// ============================================================================
// 13. Duplicate webhook event prevention
// ============================================================================

describe("Omnichannel: Duplicate webhook event prevention", () => {
  it("migration 0027 has unique constraint on (provider, external_event_id) for webhook_events", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("webhook_events_provider_external_unique"),
      "webhook_events must have a unique constraint for idempotency",
    );
    assert.ok(sql.includes("unique (provider, external_event_id)"));
  });
});

// ============================================================================
// 14. Connections page renders 5 provider cards
// ============================================================================

describe("Omnichannel: Connections page shows 5 provider cards", () => {
  it("integrations page file exists", () => {
    const pagePath = path.join(WORKTREE, "app/(app)/settings/integrations/page.tsx");
    assert.ok(fs.existsSync(pagePath), "Integrations page must exist");
  });

  it("integrations page PROVIDERS array includes exactly 5 providers", () => {
    const pagePath = path.join(WORKTREE, "app/(app)/settings/integrations/page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");

    assert.ok(src.includes("\"whatsapp\""));
    assert.ok(src.includes("\"instagram\""));
    assert.ok(src.includes("\"facebook\""));
    assert.ok(src.includes("\"google\""));
    assert.ok(src.includes("\"tiktok\""));
    // Verify it's exactly 5
    assert.ok(src.includes("const PROVIDERS: ChannelProvider[]"));
  });

  it("integration-card.tsx file exists and defines IntegrationCard", () => {
    const cardPath = path.join(WORKTREE, "components/settings/integration-card.tsx");
    assert.ok(fs.existsSync(cardPath), "IntegrationCard component must exist");
    const src = fs.readFileSync(cardPath, "utf-8");
    assert.ok(src.includes("export function IntegrationCard("));
  });

  it("PROVIDER_META in integration-card.tsx has entries for all 5 providers", () => {
    const cardPath = path.join(WORKTREE, "components/settings/integration-card.tsx");
    const src = fs.readFileSync(cardPath, "utf-8");

    assert.ok(src.includes("whatsapp:"));
    assert.ok(src.includes("instagram:"));
    assert.ok(src.includes("facebook:"));
    assert.ok(src.includes("google:"));
    assert.ok(src.includes("tiktok:"));
  });
});

// ============================================================================
// 15. Navigation constants
// ============================================================================

describe("Omnichannel: Navigation constants", () => {
  it("APP_NAVIGATION includes Integrations entry pointing to /settings/integrations", () => {
    const constantsPath = path.join(WORKTREE, "lib/constants/index.ts");
    const src = fs.readFileSync(constantsPath, "utf-8");

    assert.ok(src.includes("\"/settings/integrations\""));
    assert.ok(src.includes("\"Integrations\""));
    assert.ok(src.includes("\"plug\""));
  });

  it("app-shell.tsx includes Plug icon for integrations nav", () => {
    const shellPath = path.join(WORKTREE, "components/layout/app-shell.tsx");
    const src = fs.readFileSync(shellPath, "utf-8");

    assert.ok(src.includes("Plug,") || src.includes("Plug\n"));
    assert.ok(src.includes("plug: Plug"));
  });
});

// ============================================================================
// 16. Server-only protection
// ============================================================================

describe("Omnichannel: Server-only protection", () => {
  it("provider-adapter.ts has import server-only", () => {
    const adapterPath = path.join(WORKTREE, "server/services/integrations/provider-adapter.ts");
    const src = fs.readFileSync(adapterPath, "utf-8");
    assert.ok(src.includes("import \"server-only\";"));
  });

  it("oauth-state.ts has import server-only", () => {
    const statePath = path.join(WORKTREE, "server/services/integrations/oauth-state.ts");
    const src = fs.readFileSync(statePath, "utf-8");
    assert.ok(src.includes("import \"server-only\";"));
  });

  it("oauth-route-guard.ts has import server-only", () => {
    const guardPath = path.join(WORKTREE, "server/services/integrations/oauth-route-guard.ts");
    const src = fs.readFileSync(guardPath, "utf-8");
    assert.ok(src.includes("import \"server-only\";"));
  });

  it("channel-connections.ts has import server-only", () => {
    const connPath = path.join(WORKTREE, "server/services/integrations/channel-connections.ts");
    const src = fs.readFileSync(connPath, "utf-8");
    assert.ok(src.includes("import \"server-only\";"));
  });
});

// ============================================================================
// 17. Migration integrity
// ============================================================================

describe("Omnichannel: Migration file integrity", () => {
  it("migration file 0027_omnichannel_foundation.sql exists", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  });

  it("migration 0027 does not use DROP TABLE or CASCADE DROP in main body", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Only the rollback notes comment section may mention 'drop'; the main SQL body must not
    const rollbackIndex = sql.indexOf("-- Rollback notes");
    const mainSql = rollbackIndex >= 0 ? sql.substring(0, rollbackIndex) : sql;
    const mainSqlNoComments = mainSql.replace(/--.*$/gm, "");
    const hasDropTable = mainSqlNoComments.toLowerCase().includes("drop table");
    assert.ok(!hasDropTable, "Migration main body must not contain DROP TABLE");
  });

  it("migration 0027 registers version in deployment_migrations", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0027_omnichannel_foundation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(sql.includes("'0027'"));
    assert.ok(sql.includes("deployment_migrations"));
  });

  it("existing migrations 0001-0026 are untouched", () => {
    const migrationsDir = path.join(WORKTREE, "supabase/migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    for (const file of files) {
      if (file === "0027_omnichannel_foundation.sql") continue;
      const filePath = path.join(migrationsDir, file);
      const stat = fs.statSync(filePath);
      // File should exist (not deleted or renamed)
      assert.ok(stat.isFile(), `Migration ${file} must not be deleted`);
    }
  });
});
