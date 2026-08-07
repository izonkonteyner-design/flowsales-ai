import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import type { MetaMessagingProvider } from "@/server/services/integrations/meta-messaging-oauth";

export async function disconnectMetaMessaging(params: {
  organizationId: string;
  userId: string;
  provider: MetaMessagingProvider;
  connectionId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionLookupError } = await admin
    .from("channel_connections")
    .select("id,status")
    .eq("id", params.connectionId)
    .eq("organization_id", params.organizationId)
    .eq("provider", params.provider)
    .maybeSingle();

  if (connectionLookupError || !connection) {
    throw new Error("Meta messaging connection not found.");
  }

  // Destroy the encrypted credential first. Once disconnected, no stale token may remain usable by FlowSales.
  const { error: tokenDeleteError } = await admin
    .from("integration_tokens")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("connection_id", params.connectionId)
    .eq("provider", params.provider);
  if (tokenDeleteError) throw new Error("Failed to remove Meta messaging credential.");

  const disconnectedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("channel_connections")
    .update({
      status: "revoked",
      disconnected_at: disconnectedAt,
      disconnected_by: params.userId,
      error_message: null,
      updated_by: params.userId,
      updated_at: disconnectedAt,
    })
    .eq("id", params.connectionId)
    .eq("organization_id", params.organizationId)
    .eq("provider", params.provider);
  if (updateError) throw new Error("Failed to revoke Meta messaging connection.");

  // Display-safe account metadata may remain for reconnect UX; no access tokens are stored there.
  return { success: true as const, status: "revoked" as const, disconnectedAt };
}
