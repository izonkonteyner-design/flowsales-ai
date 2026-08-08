import { Braces, KeyRound, ServerCog } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ApiKeyCreator } from "@/components/api/api-key-creator";
import { formatDateTime } from "@/lib/utils";
import { listApiKeys } from "@/server/services/productivity";
import { revokeApiKeyAction } from "./actions";

const endpoints = [
  { method: "GET", path: "/api/health", purpose: "Servis canlılık kontrolü", auth: "Public" },
  { method: "POST", path: "/api/integrations/meta/connect", purpose: "Meta OAuth başlatma", auth: "Session + Owner/Admin" },
  { method: "POST", path: "/api/webhooks/meta-messaging", purpose: "Meta mesajlaşma webhook'u", auth: "HMAC signature" },
  { method: "POST", path: "/api/billing/webhook", purpose: "Abonelik lifecycle webhook'u", auth: "Provider signature" },
];

export default async function ApiLayerPage() {
  const keys = await listApiKeys();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform" title="API ve Entegrasyon Katmanı" description="Çalışma alanı API anahtarlarını güvenli biçimde oluşturun, iptal edin ve doğrulanmış sistem endpoint'lerini izleyin." actions={<div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-medium text-slate-300"><ServerCog className="h-4 w-4" /> Sunucu sınırı aktif</div>} />

      <SectionCard title="API anahtarı oluştur" description="Ham anahtar yalnız oluşturma anında gösterilir; veritabanında yalnız hash tutulur."><ApiKeyCreator /></SectionCard>

      <SectionCard title={`API anahtarları · ${keys.length}`} description="Owner/Admin anahtarları iptal edebilir; iptal edilen anahtar tekrar etkinleştirilmez.">
        {keys.length ? <div className="space-y-3">{keys.map((key) => <div key={key.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 text-violet-300" /><div><p className="font-medium text-white">{key.name}</p><p className="mt-1 text-xs text-slate-500">{key.key_prefix}… · {key.scopes.join(", ")} · {key.revoked_at ? "İptal edildi" : "Aktif"}</p><p className="mt-1 text-xs text-slate-600">Oluşturma: {formatDateTime(key.created_at)}{key.last_used_at ? ` · Son kullanım: ${formatDateTime(key.last_used_at)}` : ""}</p></div></div>{!key.revoked_at ? <form action={revokeApiKeyAction}><input type="hidden" name="id" value={key.id} /><button className="rounded-xl border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-400/[0.06]">İptal et</button></form> : null}</div>)}</div> : <p className="text-sm text-slate-500">Henüz API anahtarı oluşturulmadı.</p>}
      </SectionCard>

      <SectionCard title="Doğrulanmış endpoint'ler" description="Uygulamada gerçekten bulunan temel platform endpoint'leri."><div className="space-y-3">{endpoints.map((endpoint) => <div key={endpoint.path} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><Braces className="h-4 w-4 text-cyan-300" /><div><p className="font-mono text-sm font-medium text-white">{endpoint.method} {endpoint.path}</p><p className="mt-1 text-sm text-slate-500">{endpoint.purpose}</p></div></div><span className="text-xs text-slate-500">{endpoint.auth}</span></div>)}</div></SectionCard>
    </div>
  );
}
