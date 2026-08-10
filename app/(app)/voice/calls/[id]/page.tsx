import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, UserRound, Flame, MessageSquareText } from "lucide-react";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getCallDetail } from "@/server/services/voice-sales-v1";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";

export default async function VoiceCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") notFound();
  const detail = await getCallDetail(workspace.organization.id, id);
  if (!detail) notFound();
  const { call, transcript, handoffs } = detail;
  const qualification = (call.qualification ?? {}) as Record<string, unknown>;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/inbox/phone" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft className="h-4 w-4"/>Telefon Inbox</Link><h1 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">AI Telefon Görüşmesi</h1><p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4"/>{maskPhoneNumber(call.from_number)} → {maskPhoneNumber(call.to_number)}</p></div><div className="flex gap-2">{call.lead_score !== null ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700"><Flame className="h-4 w-4"/>{call.lead_score}/100 · {call.temperature ?? "-"}</span> : null}{call.lead_id ? <Link href={`/leads/${call.lead_id}`} className="rounded-xl border px-3 py-1.5 text-sm font-medium">CRM Lead</Link> : null}</div></div>

    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"><div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-blue-600"/><h2 className="font-semibold">Görüşme transcripti</h2></div><div className="mt-5 space-y-3">{transcript.map((segment) => <div key={segment.id} className={`max-w-[85%] rounded-2xl p-3 text-sm leading-6 ${segment.speaker === "customer" ? "bg-slate-100 text-slate-800" : segment.speaker === "assistant" ? "ml-auto bg-blue-600 text-white" : "bg-amber-50 text-amber-800"}`}><p className="mb-1 text-[11px] font-semibold opacity-70">{segment.speaker === "customer" ? "Müşteri" : segment.speaker === "assistant" ? "İZON AI" : "Sistem"}{segment.interrupted ? " · kesildi" : ""}</p>{segment.text}</div>)}{!transcript.length ? <p className="text-sm text-slate-500">Transcript bulunmuyor.</p> : null}</div></section>
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5"><h2 className="font-semibold">Satış özeti</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{call.summary || "Görüşme henüz tamamlanmadı."}</p>{call.next_best_action ? <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm text-blue-900"><strong>Sonraki aksiyon</strong><p className="mt-1">{call.next_best_action}</p></div> : null}</section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5"><h2 className="font-semibold">Qualification</h2><dl className="mt-4 space-y-2 text-sm">{Object.entries(qualification).filter(([,value]) => value !== null && value !== false && value !== "").map(([key,value]) => <div key={key} className="flex justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">{key}</dt><dd className="text-right font-medium">{String(value)}</dd></div>)}</dl></section>
        {handoffs.length ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-900"><UserRound className="h-5 w-5"/><h2 className="font-semibold">Temsilci aktarımı</h2></div>{handoffs.map((handoff) => <div key={handoff.id} className="mt-3 text-sm text-amber-900"><p><strong>{handoff.status}</strong> · {handoff.reason}</p><pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white/60 p-2 text-xs">{JSON.stringify(handoff.briefing,null,2)}</pre></div>)}</section> : null}
      </div>
    </div>
  </div>;
}
