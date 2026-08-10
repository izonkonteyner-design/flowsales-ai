import Link from "next/link";
import { ArrowLeft, PhoneCall, Flame, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getLeadVoiceTimeline } from "@/server/services/voice-sales-v1";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";

export default async function LeadVoiceTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") notFound();
  const calls = await getLeadVoiceTimeline(workspace.organization.id, id).catch(() => []);
  return <div className="mx-auto max-w-5xl space-y-6">
    <div><Link href={`/leads/${id}`} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft className="h-4 w-4"/>Lead detayına dön</Link><p className="mt-4 text-sm font-semibold text-blue-600">CRM Timeline</p><h1 className="text-3xl font-bold text-slate-950 dark:text-white">Telefon görüşmeleri</h1><p className="mt-2 text-sm text-slate-500">Bu Lead ile eşleşen tüm AI telefon görüşmeleri, skor ve sonraki aksiyonlar.</p></div>
    <div className="relative space-y-4 border-l-2 border-slate-200 pl-6 dark:border-white/10">
      {calls.map((call) => <article key={call.id} className="relative rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5"><span className="absolute -left-[35px] top-6 flex h-4 w-4 rounded-full border-4 border-white bg-blue-600 dark:border-slate-950"/><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><PhoneCall className="h-4 w-4 text-blue-600"/>AI telefon görüşmesi</div><p className="mt-1 text-xs text-slate-500">{new Date(call.started_at).toLocaleString("tr-TR")} · {maskPhoneNumber(call.from_number)}</p></div>{call.lead_score !== null ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"><Flame className="h-3.5 w-3.5"/>{call.lead_score}/100</span> : null}</div>{call.summary ? <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{call.summary}</p> : null}{call.next_best_action ? <p className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><span><strong>Sonraki aksiyon:</strong> {call.next_best_action}</span></p> : null}<Link href={`/voice/calls/${call.id}`} className="mt-4 inline-block text-sm font-semibold text-blue-600">Görüşmeyi aç →</Link></article>)}
      {!calls.length ? <div className="rounded-3xl border border-dashed p-8 text-sm text-slate-500">Bu Lead için telefon görüşmesi bulunmuyor.</div> : null}
    </div>
  </div>;
}
