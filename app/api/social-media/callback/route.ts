import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSocialAccess } from "@/server/services/social-access";
import { connectSocialAccount } from "@/server/services/social-media";

export async function GET(request: Request) {
  const access = await getSocialAccess();
  if (!access.canConnect || !access.workspace.userId) return NextResponse.json({ error: "Yetkili oturum gerekli." }, { status: 403 });
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!/^[a-f0-9]{64}$/.test(state) || !code || url.searchParams.has("error")) return NextResponse.json({ error: "Hesap bağlantısı iptal edildi veya doğrulanamadı." }, { status: 400 });
  const client = await createSupabaseServerClient();
  if (!client || !process.env.NEXT_PUBLIC_SITE_URL) return NextResponse.json({ error: "Bağlantı yapılandırması eksik." }, { status: 503 });
  // DELETE ... RETURNING consumes state once, bound to current tenant and actor.
  const { data, error } = await client.from("social_oauth_states").delete().eq("token_hash", createHash("sha256").update(state).digest("hex")).eq("organization_id", access.workspace.organization.id).eq("user_id", access.workspace.userId).gt("expires_at", new Date().toISOString()).select("platform").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Bağlantı isteğinin süresi dolmuş veya daha önce kullanılmış." }, { status: 400 });
  const redirectUri = new URL("/api/social-media/callback", process.env.NEXT_PUBLIC_SITE_URL).toString();
  const result = await connectSocialAccount({ platform: data.platform, code, redirect_uri: redirectUri });
  if (!result.ok) return NextResponse.json({ error: "Hesap doğrulanamadı. Sağlayıcı izinlerini ve yapılandırmasını kontrol edin." }, { status: result.statusCode ?? 502 });
  return NextResponse.redirect(new URL("/social-media/accounts", process.env.NEXT_PUBLIC_SITE_URL));
}
