import type { NextRequest } from "next/server";
import { runOAuthGuard } from "@/server/services/integrations/oauth-route-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { logger } from "@/lib/logger";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";

type Provider = "instagram" | "facebook";

type Connection = {
  id: string;
  provider: Provider;
  external_account_id: string | null;
  status: string;
};

type SubscriptionResponse = {
  data?: Array<{ subscribed_fields?: string[] }>;
  error?: { message?: string; code?: number };
};

async function repairProvider(
  provider: Provider,
  connection: Connection,
  token: string,
) {
  if (!connection.external_account_id || connection.status !== "connected") {
    return { provider, connected: false, repaired: false, verified: false, fields: [] as string[] };
  }

  const fields = provider === "instagram"
    ? ["messages", "messaging_postbacks", "messaging_seen", "message_reactions", "message_edit", "messaging_referral"]
    : ["messages", "messaging_postbacks", "message_deliveries", "message_reads"];

  const accountId = encodeURIComponent(connection.external_account_id);
  const subscribedFields = encodeURIComponent(fields.join(","));
  const base = provider === "instagram"
    ? `https://graph.instagram.com/${accountId}/subscribed_apps`
    : `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/subscribed_apps`;

  const subscribeUrl = new URL(base);
  subscribeUrl.searchParams.set("subscribed_fields", fields.join(","));
  if (provider === "instagram") subscribeUrl.searchParams.set("access_token", token);

  const subscribeResponse = await fetch(subscribeUrl, {
    method: "POST",
    headers: provider === "facebook"
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const subscribeBody = (await subscribeResponse.json().catch(() => ({}))) as SubscriptionResponse;

  const verifyUrl = new URL(base);
  if (provider === "instagram") verifyUrl.searchParams.set("access_token", token);
  const verifyResponse = await fetch(verifyUrl, {
    headers: provider === "facebook" ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  const verifyBody = (await verifyResponse.json().catch(() => ({}))) as SubscriptionResponse;
  const actualFields = Array.from(new Set(
    (Array.isArray(verifyBody.data) ? verifyBody.data : [])
      .flatMap((item) => Array.isArray(item.subscribed_fields) ? item.subscribed_fields : []),
  )).sort();
  const verified = verifyResponse.ok && actualFields.includes("messages");

  logger.info("meta_messaging.subscription_repair", {
    provider,
    organizationAccountConfigured: Boolean(connection.external_account_id),
    subscribeStatus: subscribeResponse.status,
    verifyStatus: verifyResponse.status,
    verified,
    subscribedFields: actualFields,
  });

  return {
    provider,
    connected: true,
    repaired: subscribeResponse.ok,
    verified,
    subscribeStatus: subscribeResponse.status,
    verifyStatus: verifyResponse.status,
    fields: actualFields,
    errorCode: subscribeBody.error?.code ?? verifyBody.error?.code ?? null,
  };
}

/**
 * Authenticated repair endpoint for the current organization.
 * Re-applies and verifies Facebook + Instagram messaging webhook subscriptions.
 * No access tokens or secrets are returned.
 */
export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const admin = createSupabaseAdminClient();

  const { data: connections, error } = await admin
    .from("channel_connections")
    .select("id,provider,external_account_id,status")
    .eq("organization_id", ctx.organizationId)
    .in("provider", ["instagram", "facebook"]);

  if (error) return Response.json({ error: "connection_lookup_failed" }, { status: 500 });

  const results = [] as Array<Record<string, unknown>>;
  for (const provider of ["instagram", "facebook"] as const) {
    const connection = (connections ?? []).find((item) => item.provider === provider) as Connection | undefined;
    if (!connection) {
      results.push({ provider, connected: false, repaired: false, verified: false, fields: [] });
      continue;
    }

    const { data: tokenRow } = await admin
      .from("integration_tokens")
      .select("access_token_cipher")
      .eq("organization_id", ctx.organizationId)
      .eq("connection_id", connection.id)
      .maybeSingle();

    if (!tokenRow?.access_token_cipher) {
      results.push({ provider, connected: true, repaired: false, verified: false, error: "token_missing", fields: [] });
      continue;
    }

    try {
      const token = decryptToken(tokenRow.access_token_cipher);
      results.push(await repairProvider(provider, connection, token));
    } catch (repairError) {
      logger.error("meta_messaging.subscription_repair_failed", repairError, { provider });
      results.push({ provider, connected: true, repaired: false, verified: false, error: "repair_failed", fields: [] });
    }
  }

  return Response.json({
    ok: results.every((item) => item.verified === true),
    results,
  }, { headers: { "Cache-Control": "no-store" } });
}
