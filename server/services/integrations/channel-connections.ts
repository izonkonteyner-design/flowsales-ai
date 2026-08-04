import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { type ChannelProvider, type ConnectionStatus } from "@/server/services/integrations/provider-adapter";

// ============================================================================
// Channel Connections Service
//
// Server-side data access for channel_connections and related tables.
// All reads/writes use the admin (service_role) client for server actions.
// The client-facing page reads via the user's session client (RLS enforced).
// ============================================================================

export type ChannelConnectionRow = {
  id: string;
  organization_id: string;
  provider: ChannelProvider;
  status: ConnectionStatus;
  display_name: string | null;
  external_account_id: string | null;
  scopes: string[];
  error_message: string | null;
  last_connected_at: string | null;
  last_synced_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Load all channel connections for an org (via admin client, server-side only). */
export async function loadChannelConnections(
  organizationId: string,
): Promise<ChannelConnectionRow[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("channel_connections")
    .select(
      "id, organization_id, provider, status, display_name, external_account_id, scopes, error_message, last_connected_at, last_synced_at, disconnected_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("provider");

  if (error) {
    return [];
  }

  return (data ?? []) as ChannelConnectionRow[];
}

/** Soft-disconnect a channel connection (set status = 'revoked'). */
export async function revokeChannelConnection(
  connectionId: string,
  organizationId: string,
  disconnectedByUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();

  // Verify the connection belongs to the org (workspace isolation)
  const { data: existing } = await admin
    .from("channel_connections")
    .select("id, organization_id, status")
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return { success: false, error: "Connection not found." };
  }

  const { error } = await admin
    .from("channel_connections")
    .update({
      status: "revoked",
      disconnected_at: new Date().toISOString(),
      disconnected_by: disconnectedByUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("organization_id", organizationId);

  if (error) {
    return { success: false, error: "Failed to disconnect." };
  }

  return { success: true };
}

/** Upsert a channel connection row (idempotent). Returns the connection id. */
export async function upsertChannelConnection(params: {
  organizationId: string;
  provider: ChannelProvider;
  status: ConnectionStatus;
  displayName: string | null;
  externalAccountId: string | null;
  scopes: string[];
  createdByUserId: string;
  errorMessage?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("channel_connections")
    .upsert(
      {
        organization_id: params.organizationId,
        provider: params.provider,
        status: params.status,
        display_name: params.displayName,
        external_account_id: params.externalAccountId,
        scopes: params.scopes,
        created_by: params.createdByUserId,
        updated_by: params.createdByUserId,
        error_message: params.errorMessage ?? null,
        last_connected_at:
          params.status === "connected" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,provider",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Failed to save connection." };
  }

  return { id: data.id };
}
