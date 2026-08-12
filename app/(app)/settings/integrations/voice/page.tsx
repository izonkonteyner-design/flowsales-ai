import Link from "next/link";
import { PhoneCall, ShieldCheck, PlugZap } from "lucide-react";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getVoiceProviderSettings } from "@/server/services/voice-provider-settings";
import { saveVoiceConnectionAction } from "./actions";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type ForwardingSettings = { carrier?: string; destinationProvider?: string; destinationNumber?: string; publicNumber?: string };

function forwardingSettings(value: unknown): ForwardingSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ForwardingSettings : {};
}

export default async function VoiceIntegrationPage({ searchParams }: Props) {
  const [workspace, params] = await Promise.all([getWorkspaceContext(), searchParams]);
  const canManage = workspace.mode === "live" && (workspace.role === "owner" || workspace.role === "admin");
  const settings = workspace.mode === "demo"
    ? { connections: [], runtime: { telnyxApiKeyConfigured: false, telnyxPublicKeyConfigured: false, webhookUrl: "" } }
    : await getVoiceProviderSettings(workspace.organization.id).catch(() => ({
        connections: [],
        runtime: {
          telnyxApiKeyConfigured: Boolean(process.env.TELNYX_API_KEY),
          telnyxPublicKeyConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY),
          webhookUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/webhooks/voice/telnyx`,
        },
      }));
  const forwarding = settings.connections.find((item) => item.provider === "call_forwarding");
  const forwardingMeta = forwardingSettings(forwarding?.settings);
  const telnyx = settings.connections.find((item) => item.provider === "telnyx");
  const toast = typeof params.toast === "string" ? params.toast : "";
  const danger = params.tone === "danger";
  const forwardingReady = forwarding?.status === "connected" && Boolean(forwardingMeta.destinationNumber);
  const telnyxRuntimeReady = settings.runtime.telnyxApiKeyConfigured && settings.runtime.telnyxPublicKeyConfigured;

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">İZON AI Telefon Satış Asistanı</p><h1 className="text-3xl font-bold text-slate-950 dark:text-white">Telefon numarası ve yönlendirme</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Müşterilerin bildiği Turkcell numaranız sizde kalır. FlowSales, bu numaranın AI tarafındaki hedef numaraya yönlendirme profilini ayrı ve güvenli biçimde saklar.</p></div><Link href="/settings/integrations" className="rounded-xl border px-4 py-2 text-sm font-medium">Entegrasyonlara dön</Link></div>
    {toast ? <div className={`rounded-2xl border p-4 text-sm ${danger ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{toast}</div> : null}

    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl border p-5"><PhoneCall className="h-5 w-5 text-blue-600"/><p className="mt-3 text-sm font-semibold">Müşteri numarası</p><p className="mt-1 text-sm text-slate-500">{forwarding?.phone_number || "Henüz eklenmedi"}</p></div>
      <div className="rounded-3xl border p-5"><PlugZap className="h-5 w-5 text-blue-600"/><p className="mt-3 text-sm font-semibold">AI yönlendirme hedefi</p><p className="mt-1 text-sm text-slate-500">{forwardingMeta.destinationNumber || "Henüz eklenmedi"}</p></div>
      <div className="rounded-3xl border p-5"><ShieldCheck className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-sm font-semibold">Yönlendirme profili</p><p className={`mt-1 text-sm ${forwardingReady ? "text-emerald-600" : "text-amber-600"}`}>{forwardingReady ? "Hazır" : "Aktivasyon gerekli"}</p></div>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h2 className="font-semibold">Akış</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Turkcell numarası → operatör çağrı yönlendirmesi → AI hedef numarası → FlowSales Voice. Bu ekran telefon operatöründeki yönlendirmeyi değiştirmez; sadece FlowSales tarafındaki doğru numara eşleşmesini yönetir.</p>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2"><div><dt className="text-slate-500">Operatör</dt><dd className="mt-1">{forwardingMeta.carrier === "turkcell" ? "Turkcell" : forwardingMeta.carrier || "Tanımlı değil"}</dd></div><div><dt className="text-slate-500">AI hedef sağlayıcısı</dt><dd className="mt-1">{forwardingMeta.destinationProvider === "netgsm" ? "Netgsm" : forwardingMeta.destinationProvider || "Tanımlı değil"}</dd></div><div><dt className="text-slate-500">Canlı temsilci aktarımı</dt><dd className="mt-1">{forwarding?.transfer_destination || "Tanımlı değil"}</dd></div><div><dt className="text-slate-500">Durum</dt><dd className="mt-1">{forwarding?.status || "disconnected"}</dd></div></dl>
    </section>

    {canManage ? <form action={saveVoiceConnectionAction} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"><h2 className="font-semibold">Turkcell numaranızı ekleyin</h2><p className="mt-1 text-sm text-slate-500">Secret/API anahtarları burada tutulmaz. Numara bilgileri yalnızca çalışma alanınızın Voice konfigürasyonuna kaydedilir.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm">Müşterilerin aradığı Turkcell numarası<input name="publicNumber" required defaultValue={forwarding?.phone_number ?? ""} placeholder="05XXXXXXXXX" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label><label className="text-sm">Operatör<select name="carrier" defaultValue={forwardingMeta.carrier || "turkcell"} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"><option value="turkcell">Turkcell</option><option value="other">Diğer</option></select></label><label className="text-sm">AI hedef numarası<input name="destinationNumber" required defaultValue={forwardingMeta.destinationNumber || ""} placeholder="+90..." className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label><label className="text-sm">AI hedef sağlayıcısı<select name="destinationProvider" defaultValue={forwardingMeta.destinationProvider || "netgsm"} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"><option value="telnyx">Telnyx (FlowSales AI Voice)</option><option value="netgsm">Netgsm yönlendirme</option><option value="sip">SIP trunk</option><option value="other">Diğer</option></select></label><label className="text-sm md:col-span-2">Canlı temsilci aktarım numarası<input name="transferDestination" defaultValue={forwarding?.transfer_destination ?? ""} placeholder="05XXXXXXXXX" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label></div><label className="mt-4 block text-sm"><input type="checkbox" name="connected" defaultChecked={forwarding?.status === "connected"} className="mr-2"/>Turkcell yönlendirmesini operatör tarafında da aktif ettim</label><button className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Telefon ayarını kaydet</button></form> : <div className="rounded-2xl border p-4 text-sm text-slate-500">Voice bağlantı yönetimi Owner/Admin rolü gerektirir.</div>}

    {telnyx ? <section className="rounded-3xl border border-slate-200 p-5 text-sm"><p className="font-semibold">Mevcut Telnyx teknik kaydı</p><p className="mt-2 text-slate-500">{telnyx.phone_number} · {telnyx.status} · runtime {telnyxRuntimeReady ? "hazır" : "eksik"}</p><p className="mt-2 break-all font-mono text-xs text-slate-500">{settings.runtime.webhookUrl || "/api/webhooks/voice/telnyx"}</p></section> : null}
  </div>;
}
