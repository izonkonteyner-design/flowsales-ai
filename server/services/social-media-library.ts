import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSocialAccess } from "@/server/services/social-access";
import { canEditWorkspace } from "@/lib/workspace-access";
import { detectSocialMediaType, MAX_SOCIAL_MEDIA_BYTES } from "@/lib/social-media/media-validation";

export async function listSocialMediaLibrary() {
  const access = await getSocialAccess();
  if (access.demo) return { items: [], error: null, demo: true };
  const client = await createSupabaseServerClient();
  if (!client || !access.workspace.userId) return { items: [], error: "Oturum gerekli.", demo: false };
  const { data, error } = await client.from("social_media_media").select("id,original_name,mime_type,size_bytes,storage_path,created_at").eq("organization_id", access.workspace.organization.id).order("created_at", { ascending: false }).limit(100);
  if (error) return { items: [], error: "Medya kütüphanesi yüklenemedi. Yönetici depolama yapılandırmasını kontrol etmelidir.", demo: false };
  const items = await Promise.all((data ?? []).map(async item => {
    const signed = await client.storage.from("social-media-assets").createSignedUrl(item.storage_path, 3600);
    return { ...item, url: signed.data?.signedUrl ?? null };
  }));
  return { items, error: null, demo: false };
}

export async function uploadSocialMedia(file: File) {
  const access = await getSocialAccess();
  if (!access.workspace.userId || !canEditWorkspace(access.workspace)) throw new Error("Bu işlem için canlı çalışma alanı ve yazma yetkisi gerekir.");
  if (!file.size || file.size > MAX_SOCIAL_MEDIA_BYTES) throw new Error("Dosya 1 bayt ile 10 MB arasında olmalıdır.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectSocialMediaType(bytes);
  if (!mime || mime !== file.type) throw new Error("Yalnızca dosya içeriği doğrulanan PNG, JPEG, WebP ve MP4 kabul edilir.");
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" } as const)[mime];
  const storagePath = `${access.workspace.organization.id}/${access.workspace.userId}/${randomUUID()}.${extension}`;
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Depolama yapılandırması eksik.");
  const { error: uploadError } = await client.storage.from("social-media-assets").upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) throw new Error("Dosya yüklenemedi. Depolama yapılandırmasını kontrol edin.");
  const { error } = await client.from("social_media_media").insert({ organization_id: access.workspace.organization.id, file_name: storagePath.split("/").pop(), original_name: file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200), mime_type: mime, size_bytes: file.size, url: "", storage_path: storagePath });
  if (error) { await client.storage.from("social-media-assets").remove([storagePath]); throw new Error("Medya kaydı oluşturulamadı; yükleme geri alındı."); }
}
