import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { decryptToken } from "@/server/services/integrations/encryption";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const ALLOWED_MEDIA_HOST_SUFFIXES = ["facebook.com", "fbcdn.net", "fbsbx.com"];

export type WhatsAppMediaResult =
  | { success: true; bytes: ArrayBuffer; contentType: string; fileName: string }
  | { success: false; status: number; message: string };

function isAllowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_MEDIA_HOST_SUFFIXES.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function safeFileName(value: string | null | undefined) {
  return (value || "whatsapp-media").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "whatsapp-media";
}

export async function fetchWhatsAppAttachment(params: {
  organizationId: string;
  attachmentId: string;
}): Promise<WhatsAppMediaResult> {
  const supabase = createSupabaseAdminClient();
  const { data: attachment } = await supabase
    .from("message_attachments")
    .select("id,message_id,mime_type,file_name,metadata")
    .eq("id", params.attachmentId)
    .maybeSingle();

  if (!attachment) return { success: false, status: 404, message: "Attachment not found." };

  const { data: message } = await supabase
    .from("messages")
    .select("id,organization_id,provider")
    .eq("id", attachment.message_id)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (!message || message.provider !== "whatsapp") {
    return { success: false, status: 404, message: "Attachment not found." };
  }

  const metadata = attachment.metadata && typeof attachment.metadata === "object" ? attachment.metadata as Record<string, unknown> : {};
  const mediaId = typeof metadata.provider_media_id === "string" ? metadata.provider_media_id : "";
  if (!mediaId) return { success: false, status: 404, message: "WhatsApp media is unavailable." };

  const repository = new WhatsAppConnectionsRepository();
  const connection = await repository.getWhatsAppConnectionForOrg(params.organizationId);
  if (!connection || connection.status !== "connected") {
    return { success: false, status: 409, message: "WhatsApp connection is not active." };
  }

  const tokenRecord = await repository.getWhatsAppToken(connection.id);
  if (!tokenRecord?.access_token_cipher) {
    return { success: false, status: 503, message: "WhatsApp access token is unavailable." };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(tokenRecord.access_token_cipher);
  } catch {
    return { success: false, status: 503, message: "WhatsApp access token could not be decrypted." };
  }

  const config = getWhatsAppConfig();
  const metadataResponse = await fetch(`https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  if (!metadataResponse?.ok) {
    return { success: false, status: 502, message: "Meta media metadata request failed." };
  }

  const mediaMetadata = await metadataResponse.json().catch(() => null) as Record<string, unknown> | null;
  const downloadUrl = typeof mediaMetadata?.url === "string" ? mediaMetadata.url : "";
  if (!downloadUrl || !isAllowedMediaUrl(downloadUrl)) {
    return { success: false, status: 502, message: "Meta returned an invalid media URL." };
  }

  const declaredSize = Number(mediaMetadata?.file_size || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
    return { success: false, status: 413, message: "WhatsApp media exceeds the 25 MB viewing limit." };
  }

  const mediaResponse = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);

  if (!mediaResponse?.ok) {
    return { success: false, status: 502, message: "WhatsApp media download failed." };
  }

  const bytes = await mediaResponse.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return { success: false, status: 413, message: "WhatsApp media exceeds the 25 MB viewing limit." };
  }

  const contentType = (typeof mediaMetadata?.mime_type === "string" && mediaMetadata.mime_type) || attachment.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream";
  return { success: true, bytes, contentType, fileName: safeFileName(attachment.file_name) };
}
