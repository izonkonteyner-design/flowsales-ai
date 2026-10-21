import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-media/registry";
import { socialPlatformSchema } from "@/lib/social-media/validation";
import { getSocialAccess } from "@/server/services/social-access";
import { isEncryptionConfigured } from "@/lib/crypto";

export async function GET(request: Request) {
  const access = await getSocialAccess();
  if (!access.canConnect || !access.workspace.userId) return NextResponse.json({ error: "Hesap bağlamak için canlı çalışma alanı ve Owner/Admin yetkisi gerekir." }, { status: 403 });
  const platform = socialPlatformSchema.safeParse(new URL(request.url).searchParams.get("platform"));
  if (!platform.success) return NextResponse.json({ error: "Geçersiz platform." }, { status: 400 });
  if (!isEncryptionConfigured() || !process.env.NEXT_PUBLIC_SITE_URL) return NextResponse.json({ error: "Yayın hesabı bağlantısı için sağlayıcı ve şifreleme yapılandırması gerekli." }, { status: 503 });
  try {
    const state = randomBytes(32).toString("hex");
    const redirectUri = new URL("/api/social-media/callback", process.env.NEXT_PUBLIC_SITE_URL).toString();
    const url = getProvider(platform.data).authorizeUrl(state, redirectUri);
    const client = await createSupabaseServerClient();
    if (!client) throw new Error("unconfigured");
    const { error } = await client.from("social_oauth_states").insert({ token_hash: createHash("sha256").update(state).digest("hex"), organization_id: access.workspace.organization.id, user_id: access.workspace.userId, platform: platform.data, expires_at: new Date(Date.now() + 600_000).toISOString() });
    if (error) throw new Error("state unavailable");
    return NextResponse.redirect(url);
  } catch { return NextResponse.json({ error: "Bu platform için hesap bağlantısı henüz hazır değil. Yönetici yapılandırmayı kontrol etmelidir." }, { status: 503 }); }
}
