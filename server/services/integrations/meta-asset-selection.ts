import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { connectMetaMessagingAsset, discoverMetaMessagingAssets, type MetaMessagingProvider } from "@/server/services/integrations/meta-messaging";

export async function listMetaAssetsForSelection(params: { organizationId: string; provider: MetaMessagingProvider }) {
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("channel_connections").select("id,status")
    .eq("organization_id", params.organizationId).eq("provider", params.provider).maybeSingle();
  if (!connection || connection.status !== "connecting") throw new Error("No pending Meta connection was found.");
  const { data: token } = await admin.from("integration_tokens").select("access_token_cipher")
    .eq("organization_id", params.organizationId).eq("connection_id", connection.id).maybeSingle();
  if (!token?.access_token_cipher) throw new Error("Pending Meta token is unavailable.");
  const pages = await discoverMetaMessagingAssets(decryptToken(token.access_token_cipher));
  return pages.flatMap((page) => {
    if (params.provider === "facebook") return [{ pageId: page.id, assetId: page.id, name: page.name ?? "Facebook Page", username: null }];
    if (!page.instagram_business_account) return [];
    return [{ pageId: page.id, assetId: page.instagram_business_account.id, name: page.instagram_business_account.name ?? page.instagram_business_account.username ?? "Instagram", username: page.instagram_business_account.username ?? null }];
  });
}

export async function selectMetaAsset(params: { organizationId: string; userId: string; provider: MetaMessagingProvider; assetId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("channel_connections").select("id,status")
    .eq("organization_id", params.organizationId).eq("provider", params.provider).maybeSingle();
  if (!connection || connection.status !== "connecting") throw new Error("No pending Meta connection was found.");
  const { data: token } = await admin.from("integration_tokens").select("access_token_cipher")
    .eq("organization_id", params.organizationId).eq("connection_id", connection.id).maybeSingle();
  if (!token?.access_token_cipher) throw new Error("Pending Meta token is unavailable.");
  const pages = await discoverMetaMessagingAssets(decryptToken(token.access_token_cipher));
  const page = pages.find((candidate) => params.provider === "facebook" ? candidate.id === params.assetId : candidate.instagram_business_account?.id === params.assetId);
  if (!page) throw new Error("The selected Meta asset is not available to this authorization.");
  return connectMetaMessagingAsset({ organizationId: params.organizationId, userId: params.userId, provider: params.provider, page });
}
