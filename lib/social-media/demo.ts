import type { SocialMediaAccount, SocialMediaPost } from "@/types/social-media";

export function socialDemoData(organizationId: string, now = new Date()) {
  const timestamp = now.toISOString();
  const accountId = "de000001-0000-4000-8000-000000000001";
  const accounts: SocialMediaAccount[] = [{ id: accountId, organization_id: organizationId, platform: "instagram", platform_account_id: "demo-preview", username: "ornek-isletme", profile_picture_url: null, status: "disconnected", scopes: [], token_expires_at: null, connected_at: timestamp, updated_at: timestamp }];
  const post = { organization_id: organizationId, account_id: accountId, platform: "instagram" as const, media_urls: [], published_at: null, platform_post_id: null, platform_post_url: null, error_message: null, retry_count: 0, created_by: null, created_at: timestamp, updated_at: timestamp };
  const posts: SocialMediaPost[] = [
    { ...post, id: "de000002-0000-4000-8000-000000000001", status: "draft", content: "Örnek taslak: Yeni ürünümüzü ve kullanım alanlarını keşfedin. Bu içerik yayımlanmaz.", scheduled_at: null },
    { ...post, id: "de000002-0000-4000-8000-000000000002", status: "scheduled", content: "Örnek yayın planı: Haftalık ürün tanıtımı. Gerçek bir yayın kuyruğuna eklenmez.", scheduled_at: new Date(now.getTime() + 86_400_000).toISOString() },
  ];
  return { accounts, posts };
}
