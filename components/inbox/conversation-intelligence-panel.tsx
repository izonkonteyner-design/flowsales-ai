"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BrainCircuit, Check, Clock3, DatabaseZap, Loader2, Play, Target, X } from "lucide-react";

type ScoreFactor = { factor: string; points: number; evidence: string };
type Signals = { productInterest?: string | null; location?: string | null; budget?: string | null; timeline?: string | null; useCase?: string | null; buyingSignals?: string[]; objections?: string[] };
type Qualification = {
  id: string; lead_id?: string | null; leadId?: string | null; score: number; intent: string; temperature: string; summary: string;
  sales_stage?: string; salesStage?: string; priority?: string; confidence?: number; signals?: Signals;
  missing_information?: string[]; missingInformation?: string[]; score_breakdown?: ScoreFactor[]; scoreBreakdown?: ScoreFactor[];
  next_best_action?: string; nextBestAction?: string; next_best_action_type?: string; nextBestActionType?: string;
  next_best_action_rationale?: string; nextBestActionRationale?: string; status: "suggested" | "accepted" | "dismissed";
};
type FollowUpAction = { id: string; action_type: string; status: string; scheduled_for: string; payload: Record<string, unknown> };
type FollowUpPlan = { id: string; status: string; strategy: string; next_action_at: string | null; actions: FollowUpAction[] };

const stageLabels: Record<string, string> = { new_lead: "Yeni lead", discovery: "İhtiyaç analizi", qualified: "Nitelikli", quote_ready: "Teklife hazır", quote_sent: "Teklif gönderildi", negotiation: "Pazarlık", won: "Kazanıldı", lost: "Kaybedildi", support: "Destek" };
const priorityLabels: Record<string, string> = { high: "Yüksek", medium: "Orta", low: "Düşük" };
const actionLabels: Record<string, string> = { ask_question: "Eksik bilgiyi sor", share_information: "Bilgi paylaş", create_quote: "Teklif hazırla", follow_up: "Takip et", call: "Ara", no_action: "İşlem gerekmiyor" };
function valueOrDash(value?: string | null) { return value?.trim() || "—"; }

export function ConversationIntelligencePanel({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [qualification, setQualification] = useState<Qualification | null>(null);
  const [plan, setPlan] = useState<FollowUpPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crmSynced, setCrmSynced] = useState(false);

  async function refresh() {
    const [qRes, pRes] = await Promise.all([
      fetch(`/api/inbox/conversations/${conversationId}/qualification`, { cache: "no-store" }),
      fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { cache: "no-store" }),
    ]);
    const q = await qRes.json().catch(() => ({})); const p = await pRes.json().catch(() => ({}));
    setQualification(q.qualification || null); setPlan(p.plan || null);
  }

  useEffect(() => { let active = true; Promise.all([
    fetch(`/api/inbox/conversations/${conversationId}/qualification`, { cache: "no-store" }).then((r) => r.json().catch(() => ({}))),
    fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { cache: "no-store" }).then((r) => r.json().catch(() => ({}))),
  ]).then(([q,p]) => { if (active) { setQualification(q.qualification || null); setPlan(p.plan || null); } }).catch(() => { if (active) setError("Satış zekâsı yüklenemedi."); }); return () => { active = false; }; }, [conversationId]);

  async function generate() { setLoading(true); setError(null); try { const r = await fetch(`/api/inbox/conversations/${conversationId}/qualification`, { method: "POST" }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "Satış analizi başarısız."); setQualification(d.qualification); setCrmSynced(false); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Satış analizi başarısız."); } finally { setLoading(false); } }
  async function review(decision: "accepted" | "dismissed") { if (!qualification) return; setLoading(true); setError(null); try { const r = await fetch(`/api/inbox/conversations/${conversationId}/qualification`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualificationId: qualification.id, decision }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "Karar kaydedilemedi."); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Karar kaydedilemedi."); } finally { setLoading(false); } }
  async function createPlan() { if (!qualification) return; setLoading(true); setError(null); try { const r = await fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualificationId: qualification.id }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "Takip planı oluşturulamadı."); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Takip planı oluşturulamadı."); } finally { setLoading(false); } }
  async function updateAction(actionId: string, decision: "approved" | "completed" | "cancelled") { setLoading(true); setError(null); try { const r = await fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId, decision }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "Takip aksiyonu güncellenemedi."); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Takip aksiyonu güncellenemedi."); } finally { setLoading(false); } }
  async function syncCrm() { if (!qualification) return; setLoading(true); setError(null); try { const r = await fetch(`/api/inbox/conversations/${conversationId}/crm-sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualificationId: qualification.id }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "CRM önerileri uygulanamadı."); setCrmSynced(true); } catch (e) { setError(e instanceof Error ? e.message : "CRM önerileri uygulanamadı."); } finally { setLoading(false); } }

  const signals = qualification?.signals || {}; const missing = qualification?.missingInformation || qualification?.missing_information || [];
  const breakdown = qualification?.scoreBreakdown || qualification?.score_breakdown || []; const salesStage = qualification?.salesStage || qualification?.sales_stage || "new_lead";
  const nextAction = qualification?.nextBestAction || qualification?.next_best_action; const nextActionType = qualification?.nextBestActionType || qualification?.next_best_action_type || "ask_question";
  const rationale = qualification?.nextBestActionRationale || qualification?.next_best_action_rationale; const leadId = qualification?.leadId || qualification?.lead_id || null;

  function runNextBestAction() {
    if (!qualification || disabled || loading) return;
    if (nextActionType === "ask_question" || nextActionType === "share_information") {
      window.dispatchEvent(new CustomEvent("flowsales:generate-reply", { detail: { conversationId } })); return;
    }
    if (nextActionType === "create_quote" && leadId) { window.location.href = `/quotes/new?lead_id=${encodeURIComponent(leadId)}`; return; }
    if (nextActionType === "follow_up") { if (qualification.status === "accepted" && !plan) void createPlan(); return; }
    if (nextActionType === "call" && leadId) { window.location.href = `/leads/${encodeURIComponent(leadId)}`; }
  }

  const canRunNba = nextActionType !== "no_action" && ((nextActionType !== "create_quote" && nextActionType !== "call") || Boolean(leadId));
  return <section className="border-b border-slate-800/80 bg-cyan-950/15 px-6 py-4 text-xs">
    <div className="flex flex-wrap items-center gap-2"><BrainCircuit className="h-4 w-4 text-cyan-300" /><span className="font-semibold text-slate-200">AI Conversation Intelligence 2.0</span><span className="text-slate-500">AI önerir; CRM değişikliği ve müşteri iletişimi insan onayı olmadan yapılmaz.</span><button type="button" onClick={() => void generate()} disabled={disabled || loading} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-cyan-700/60 px-2.5 py-1 text-cyan-200 hover:bg-cyan-900/30 disabled:opacity-50">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />} {qualification ? "Yeniden analiz et" : "Satış analizi yap"}</button></div>
    {qualification && <div className="mt-3 space-y-3">
      <div className="grid gap-2 lg:grid-cols-[160px_1fr_1fr]">
        <div className="rounded-xl border border-cyan-800/50 bg-slate-950/70 p-3 text-center"><div className="text-3xl font-bold text-cyan-300">{qualification.score}</div><div className="text-slate-500">Lead Score / 100</div><div className="mt-2 text-slate-300">{qualification.temperature} · {qualification.intent}</div><div className="mt-1 text-slate-400">Öncelik: {priorityLabels[qualification.priority || "medium"] || qualification.priority}</div>{typeof qualification.confidence === "number" && <div className="mt-1 text-slate-500">AI güveni: %{Math.round(qualification.confidence * 100)}</div>}</div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="mb-2 flex items-center gap-1.5 text-cyan-200"><Target className="h-3.5 w-3.5" /><strong>Satış durumu</strong></div><div className="text-sm font-semibold text-slate-200">{stageLabels[salesStage] || salesStage}</div><p className="mt-2 leading-5 text-slate-300">{qualification.summary}</p></div>
        <div className="rounded-xl border border-cyan-800/40 bg-slate-950/70 p-3"><div className="text-cyan-200"><strong>Sonraki en iyi aksiyon</strong></div><div className="mt-1 text-sm font-semibold text-slate-100">{actionLabels[nextActionType] || nextActionType}</div><p className="mt-1 leading-5 text-slate-300">{nextAction}</p>{rationale && <p className="mt-2 text-slate-500">Neden: {rationale}</p>}<button type="button" disabled={!canRunNba || disabled || loading} onClick={runNextBestAction} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-2.5 py-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Aksiyona geç <ArrowUpRight className="h-3.5 w-3.5" /></button></div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">{[["Ürün ilgisi",signals.productInterest],["Lokasyon",signals.location],["Bütçe",signals.budget],["Zamanlama",signals.timeline],["Kullanım amacı",signals.useCase]].map(([label,value]) => <div key={label as string} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5"><div className="text-slate-500">{label}</div><div className="mt-1 text-slate-200">{valueOrDash(value as string | null | undefined)}</div></div>)}</div>
      <div className="grid gap-2 lg:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><strong className="text-emerald-300">Satın alma sinyalleri</strong><ul className="mt-2 space-y-1 text-slate-300">{signals.buyingSignals?.length ? signals.buyingSignals.map((item) => <li key={item}>• {item}</li>) : <li className="text-slate-500">Kanıtlanmış sinyal yok.</li>}</ul></div><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><strong className="text-amber-300">Eksik bilgiler</strong><ul className="mt-2 space-y-1 text-slate-300">{missing.length ? missing.map((item) => <li key={item}>• {item}</li>) : <li className="text-slate-500">Kritik eksik bilgi yok.</li>}</ul></div><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><strong className="text-rose-300">İtiraz / risk</strong><ul className="mt-2 space-y-1 text-slate-300">{signals.objections?.length ? signals.objections.map((item) => <li key={item}>• {item}</li>) : <li className="text-slate-500">Açık itiraz yok.</li>}</ul></div></div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><strong className="text-slate-200">Lead Score neden bu puan?</strong><div className="mt-2 space-y-1.5">{breakdown.map((item,index) => <div key={`${item.factor}-${index}`} className="grid gap-1 rounded-lg bg-slate-900 px-2.5 py-2 md:grid-cols-[180px_60px_1fr]"><span className="font-medium text-slate-300">{item.factor}</span><span className={item.points >= 0 ? "text-emerald-300" : "text-rose-300"}>{item.points >= 0 ? "+" : ""}{item.points}</span><span className="text-slate-500">{item.evidence}</span></div>)}</div></div>
      <div className="flex flex-wrap gap-2">
        {qualification.status === "suggested" && <><button disabled={disabled || loading} onClick={() => void review("accepted")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-white"><Check className="h-3 w-3" /> Analizi kabul et</button><button disabled={disabled || loading} onClick={() => void review("dismissed")} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300"><X className="h-3 w-3" /> Reddet</button></>}
        {qualification.status === "accepted" && leadId && <button disabled={disabled || loading || crmSynced} onClick={() => void syncCrm()} className="inline-flex items-center gap-1 rounded-lg border border-violet-700 bg-violet-950/40 px-2.5 py-1.5 text-violet-200 disabled:opacity-50"><DatabaseZap className="h-3 w-3" /> {crmSynced ? "CRM önerileri uygulandı" : "CRM önerilerini lead'e uygula"}</button>}
        {qualification.status === "accepted" && !plan && <button disabled={disabled || loading} onClick={() => void createPlan()} className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-2.5 py-1.5 text-white"><Play className="h-3 w-3" /> Onaylı takip planı oluştur</button>}
        <span className="self-center text-slate-500">Durum: {qualification.status}</span>
      </div>
    </div>}
    {plan && <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-cyan-300" /><strong className="text-slate-200">Takip planı</strong><span className="text-slate-500">{plan.strategy} · {plan.status}</span></div><div className="mt-2 space-y-1.5">{plan.actions.map((action) => <div key={action.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-2"><span className="font-medium text-slate-300">{action.action_type.replaceAll("_"," ")}</span><span className="text-slate-500">{new Date(action.scheduled_for).toLocaleString("tr-TR")}</span><span className="text-slate-500">{action.status.replaceAll("_"," ")}</span><div className="ml-auto flex gap-1">{action.status === "approval_required" && <button disabled={disabled || loading} onClick={() => void updateAction(action.id,"approved")} className="rounded bg-emerald-800 px-2 py-1 text-emerald-100">Onayla</button>}{action.status === "approved" && <button disabled={disabled || loading} onClick={() => void updateAction(action.id,"completed")} className="rounded bg-cyan-800 px-2 py-1 text-cyan-100">Tamamla</button>}{!["completed","cancelled"].includes(action.status) && <button disabled={disabled || loading} onClick={() => void updateAction(action.id,"cancelled")} className="rounded border border-slate-700 px-2 py-1 text-slate-400">İptal</button>}</div></div>)}</div></div>}
    {error && <div className="mt-2 text-rose-300">{error}</div>}
  </section>;
}
