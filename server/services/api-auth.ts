import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";

export type ApiScope = "crm:read" | "crm:write";

export type ApiPrincipal = {
  keyId: string;
  organizationId: string;
  scopes: string[];
};

function hashKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function extractBearer(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const value = header.slice(7).trim();
  return value.startsWith("fsa_") && value.length >= 32 ? value : null;
}

export async function authenticateApiRequest(request: NextRequest, requiredScope: ApiScope): Promise<{ ok: true; principal: ApiPrincipal } | { ok: false; response: Response }> {
  const token = extractBearer(request);
  if (!token) return { ok: false, response: Response.json({ error: "invalid_api_key" }, { status: 401 }) };

  const prefix = token.slice(0, 12);
  const digest = hashKey(token);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,organization_id,key_hash,scopes,expires_at,revoked_at")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data?.key_hash) return { ok: false, response: Response.json({ error: "invalid_api_key" }, { status: 401 }) };
  const expected = Buffer.from(String(data.key_hash), "utf8");
  const supplied = Buffer.from(digest, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, response: Response.json({ error: "invalid_api_key" }, { status: 401 }) };
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return { ok: false, response: Response.json({ error: "api_key_expired" }, { status: 401 }) };

  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  if (!scopes.includes(requiredScope)) return { ok: false, response: Response.json({ error: "insufficient_scope", required_scope: requiredScope }, { status: 403 }) };

  try {
    const bucket = `api_key:${data.id}`;
    const rate = await checkRateLimit(bucket, `public_api_${requiredScope}`, 120, 60_000);
    if (!rate.allowed) return { ok: false, response: Response.json({ error: "rate_limit_exceeded" }, { status: 429 }) };
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) return { ok: false, response: Response.json({ error: "rate_limit_unavailable" }, { status: 503 }) };
    throw error;
  }

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true, principal: { keyId: data.id, organizationId: data.organization_id, scopes } };
}
