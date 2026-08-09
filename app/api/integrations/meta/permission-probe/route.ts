import type { NextRequest } from "next/server";
import { runOAuthGuard } from "@/server/services/integrations/oauth-route-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { logger } from "@/lib/logger";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";

async function probe(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return { ok: response.ok, status: response.status };
}

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const rawProvider = request.nextUrl.searchParams.get("provider") || "instagram";
  if (rawProvider !== "instagram" && rawProvider !== "facebook") {
    return Response.json({ error: "invalid_provider" }, { status: 400 });
  }
  const provider = rawProvider;
  const admin = createSupabaseAdminClient();

  const { data: connection, error: connectionError } = await admin
    .from("channel_connections")
    .select("id,external_account_id,status")
    .eq("organization_id", ctx.organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (connectionError || !connection || connection.status !== "connected" || !connection.external_account_id) {
    return Response.json({ provider, connected: false, error: "connection_required" }, { status: 409 });
  }

  const { data: tokenRow } = await admin
    .from("integration_tokens")
    .select("access_token_cipher")
    .eq("organization_id", ctx.organizationId)
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (!tokenRow?.access_token_cipher) {
    return Response.json({ provider, connected: true, error: "token_missing" }, { status: 409 });
  }

  const token = decryptToken(tokenRow.access_token_cipher);
  let identity: { ok: boolean; status: number };
  let conversations: { ok: boolean; status: number };

  if (provider === "instagram") {
    identity = await probe(
      `https://graph.instagram.com/me?fields=id,user_id,username,account_type`,
      token,
    );
    conversations = await probe(
      `https://graph.instagram.com/${encodeURIComponent(connection.external_account_id)}/conversations?platform=instagram&limit=1`,
      token,
    );
  } else {
    identity = await probe(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(connection.external_account_id)}?fields=id,name`,
      token,
    );
    conversations = await probe(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(connection.external_account_id)}/conversations?platform=messenger&limit=1`,
      token,
    );
  }

  logger.info("meta_messaging.permission_probe", {
    provider,
    organizationId: ctx.organizationId,
    identityStatus: identity.status,
    conversationsStatus: conversations.status,
  });

  return Response.json(
    {
      provider,
      connected: true,
      identity,
      messaging: conversations,
      healthy: identity.ok && conversations.ok,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
