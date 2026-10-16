import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { listSocialMediaAccounts } from "@/server/services/social-media";
import { getSocialAccess } from "@/server/services/social-access";
import { listProviders, getProvider } from "@/lib/social-media/registry";
import { isEncryptionConfigured } from "@/lib/crypto";
import { ConnectAccountButton, DisconnectAccountButton } from "@/components/social-media/ConnectAccountButton";

export default async function SocialAccountsPage() {
  const access = await getSocialAccess();
  const result = await listSocialMediaAccounts();
  const callback = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/social-media/callback`;
  return <div className="space-y-6">
    <PageHeader eyebrow="Sosyal medya" title="Sosyal medya hesapları" description="Yayın hesaplarını, bağlantı durumlarını ve desteklenen platformları tek yerde görün." actions={<Link href="/social-media/posts">İçerik stüdyosunu aç →</Link>} />
    <div className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">{access.reason || "Hesap bağlantılarını yalnızca çalışma alanı sahibi ve yöneticileri yönetebilir."} {access.demo ? "Aşağıdaki hesap bir örnek önizlemedir; gerçek bağlantı değildir." : ""}</div>
    {!result.ok ? <div role="alert" className="text-amber-300">{result.error}</div> : null}
    <SectionCard title="Hesaplar" description="Bağlantı kesildiğinde saklanan erişim anahtarı kaldırılır.">
      {result.ok && result.data.length ? <div className="space-y-3">{result.data.map(account => <article key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-medium">{account.username || account.platform_account_id}</p><p className="text-sm text-slate-400">{account.platform} · {account.status === "connected" ? "Bağlı" : account.status === "expired" ? "Süresi doldu" : "Bağlı değil"}{access.demo ? " · Örnek veri" : ""}</p></div><DisconnectAccountButton accountId={account.id} disabled={!access.canConnect || account.status === "disconnected"} /></article>)}</div> : <p className="text-slate-400">Henüz bir yayın hesabı bağlı değil. Aşağıdan desteklenen bir platform seçin.</p>}
    </SectionCard>
    <SectionCard title="Platform bağlantıları" description="Mesajlaşma bağlantıları ile yayınlama izinleri farklıdır. Her platform için yayınlama yetkisi ayrıca doğrulanır.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{listProviders().map(provider => {
        let configured = false;
        if (provider.implemented && isEncryptionConfigured()) { try { getProvider(provider.platform).authorizeUrl("configuration-check", callback); configured = true; } catch {} }
        return <article key={provider.platform} className="rounded-xl border border-white/10 p-4"><h2 className="font-semibold">{provider.label}</h2><p className="my-3 text-sm text-slate-400">{!provider.implemented ? "Bu platform için yayınlama henüz desteklenmiyor." : !configured ? "Sağlayıcı veya şifreleme yapılandırması gerekli." : "OAuth ile güvenli hesap bağlantısı."}</p><ConnectAccountButton platform={provider.platform} disabled={!access.canConnect || !configured} /></article>;
      })}</div>
      <Link href="/settings/integrations" className="mt-5 inline-block text-sm text-cyan-300">Mesajlaşma ve e-posta entegrasyonları →</Link>
    </SectionCard>
  </div>;
}
