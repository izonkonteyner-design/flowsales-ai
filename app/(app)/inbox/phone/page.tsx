import Link from "next/link";
import { Phone, Flame, Clock3, ArrowRight } from "lucide-react";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { VoiceSalesRepository } from "@/server/services/voice-sales-v1";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";

export default async function PhoneInboxPage() {
  const workspace = await getWorkspaceContext();
  const calls = workspace.mode === "demo" ? [] : await new VoiceSalesRepository().listCalls(workspace.organization.id, 100).catch(() => []);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">Unified Inbox</p><h1 className="text-3xl font-bold text-slate-950 dark:text-white">Telefon</h1><p className="mt-2 text-sm text-slate-500">AI telefon görüşmeleri, transcript, Lead Score, özet ve sonraki aksiyon tek satış kanalı görünümünde.</p></div><Link href="/inbox" className="rounded-xl border px-4 py-2 text-sm font-medium">Tüm mesaj kanalları</Link></div>
    <div className="grid gap-3">
      {calls.map((call) => <Link key={call.id} href={`/voice/calls/${call.id}`} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Phone className="h-5 w-5"/></div><div><p className="font-semibold text-slate-950 dark:text-white">{maskPhoneNumber(call.from_number)}</p><p className="mt-1 text-xs text-slate-500">{new Date(call.started_at).toLocaleString("tr-TR")} · {call.duration_seconds ? `${Math.floor(call.duration_seconds/60)} dk ${call.duration_seconds%60} sn` : call.state}</p></div></div><div className="flex items-center gap-2">{call.lead_score !== null ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"><Flame className="h-3.5 w-3.5"/>{call.lead_score}</span> : null}<ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1"/></div></div>
        {call.summary ? <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{call.summary}</p> : null}
        {call.next_best_action ? <div className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><span><strong>Sonraki aksiyon:</strong> {call.next_best_action}</span></div> : null}
      </Link>)}
      {!calls.length ? <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Henüz telefon görüşmesi yok. Telnyx bağlantısı aktif olduğunda gelen çağrılar burada görünecek.</div> : null}
    </div>
  </div>;
}
