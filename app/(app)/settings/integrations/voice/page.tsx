import Link from "next/link";
import { PhoneCall, ShieldCheck, PlugZap } from "lucide-react";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getVoiceProviderSettings } from "@/server/services/voice-provider-settings";
import { saveVoiceConnectionAction } from "./actions";

type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };

export default async function VoiceIntegrationPage({ searchParams }: Props) {
  const [workspace, params] = await Promise.all([getWorkspaceContext(), searchParams]);
  const canManage = workspace.mode === "live" && (workspace.role === "owner" || workspace.role === "admin");
  const settings = workspace.mode === "demo" ? { connections: [], runtime: { telnyxApiKeyConfigured: false, telnyxPublicKeyConfigured: false, webhookUrl: "" } } : await getVoiceProviderSettings(workspace.organization.id).catch(() => ({ connections: [], runtime: { telnyxApiKeyConfigured: Boolean(process.env.TELNYX_API_KEY), telnyxPublicKeyConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY), webhookUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/webhooks/voice/telnyx` } }));
  const telnyx = settings.connections.find((item) => item.provider === "telnyx");
  const toast = typeof params.toast === "string" ? params.toast : "";
  const danger = params.tone === "danger";
  const runtimeReady = settings.runtime.telnyxApiKeyConfigured && settings.runtime.telnyxPublicKeyConfigured;

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">İZON AI Telefon Satış Asistanı</p><h1 className="text-3xl font-bold text-slate-950 dark:text-white">Telefon sağlayıcısı</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">FlowSales voice katmanı provider-independent kalır. İlk gerçek adaptör Telnyx Call Control için hazırlanmıştır.</p></div><Link href="/settings/integrations" className="rounded-xl border px-4 py-2 text-sm font-medium">Entegrasyonlara dön</Link></div>
    {toast ? <div className={`rounded-2xl border p-4 text-sm ${danger ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{toast}</div> : null}

    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl border p-5"><ShieldCheck className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-sm font-semibold">API anahtarı</p><p className="mt-1 text-sm text-slate-500">{settings.runtime.telnyxApiKeyConfigured ? "Yapılandırıldı" : "Eksik"}</p></div>
      <div className="rounded-3xl border p-5"><ShieldCheck className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-sm font-semibold">Webhook public key</p><p className="mt-1 text-sm text-slate-500">{settings.runtime.telnyxPublicKeyConfigured ? "Yapılandırıldı" : "Eksik"}</p></div>
      <div className="rounded-3xl border p-5"><PlugZap className="h-5 w-5 text-blue-600"/><p className="mt-3 text-sm font-semibold">Runtime durumu</p><p className={`mt-1 text-sm ${runtimeReady ? "text-emerald-600" : "text-amber-600"}`}>{runtimeReady ? "Hazır" : "Aktivasyon gerekli"}</p></div>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"><div className="flex items-center gap-2"><PhoneCall className="h-5 w-5 text-blue-600"/><h2 className="font-semibold">Telnyx Call Control</h2></div><dl className="mt-4 grid gap-3 text-sm md:grid-cols-2"><div><dt className="text-slate-500">Webhook</dt><dd className="mt-1 break-all font-mono text-xs">{settings.runtime.webhookUrl || "/api/webhooks/voice/telnyx"}</dd></div><div><dt className="text-slate-500">Kayıtlı numara</dt><dd className="mt-1">{telnyx?.phone_number || "Henüz yok"}</dd></div><div><dt className="text-slate-500">Durum</dt><dd className="mt-1">{telnyx?.status || "disconnected"}</dd></div><div><dt className="text-slate-500">Temsilci aktarımı</dt><dd className="mt-1">{telnyx?.transfer_destination || "Tanımlı değil"}</dd></div></dl></section>

    {canManage ? <form action={saveVoiceConnectionAction} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"><h2 className="font-semibold">Bağlantı kaydı</h2><p className="mt-1 text-sm text-slate-500">Secret değerleri bu formda tutulmaz. Yalnızca provider numarası ve yönlendirme bilgileri kaydedilir.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm">Telnyx telefon numarası<input name="phoneNumber" required defaultValue={telnyx?.phone_number ?? ""} placeholder="+90..." className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label><label className="text-sm">Call Control App / connection ID<input name="externalConnectionId" defaultValue={telnyx?.external_connection_id ?? ""} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label><label className="text-sm md:col-span-2">Canlı temsilci aktarım numarası<input name="transferDestination" defaultValue={telnyx?.transfer_destination ?? ""} placeholder="+90..." className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2"/></label></div><label className="mt-4 block text-sm"><input type="checkbox" name="connected" defaultChecked={telnyx?.status === "connected"} className="mr-2"/>Bu numarayı aktif telefon kanalı olarak kullan</label><button className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Voice bağlantısını kaydet</button></form> : <div className="rounded-2xl border p-4 text-sm text-slate-500">Voice bağlantı yönetimi Owner/Admin rolü gerektirir.</div>}
  </div>;
}
