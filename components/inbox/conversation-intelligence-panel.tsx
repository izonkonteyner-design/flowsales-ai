"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Check, Clock3, Loader2, Play, X } from "lucide-react";

type Qualification = {
  id: string; score: number; intent: string; temperature: string; summary: string;
  next_best_action?: string; nextBestAction?: string; status: "suggested" | "accepted" | "dismissed";
};
type FollowUpAction = { id: string; action_type: string; status: string; scheduled_for: string; payload: Record<string, unknown> };
type FollowUpPlan = { id: string; status: string; strategy: string; next_action_at: string | null; actions: FollowUpAction[] };

export function ConversationIntelligencePanel({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [qualification, setQualification] = useState<Qualification | null>(null);
  const [plan, setPlan] = useState<FollowUpPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [qRes, pRes] = await Promise.all([
      fetch(`/api/inbox/conversations/${conversationId}/qualification`, { cache: "no-store" }),
      fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { cache: "no-store" }),
    ]);
    const q = await qRes.json().catch(() => ({}));
    const p = await pRes.json().catch(() => ({}));
    setQualification(q.qualification || null);
    setPlan(p.plan || null);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/inbox/conversations/${conversationId}/qualification`, { cache: "no-store" }).then((response) => response.json().catch(() => ({}))),
      fetch(`/api/inbox/conversations/${conversationId}/follow-up`, { cache: "no-store" }).then((response) => response.json().catch(() => ({}))),
    ]).then(([q, p]) => {
      if (!active) return;
      setQualification(q.qualification || null);
      setPlan(p.plan || null);
    }).catch(() => {
      if (active) setError("Conversation intelligence could not be loaded.");
    });
    return () => { active = false; };
  }, [conversationId]);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/qualification`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Qualification failed.");
      setQualification(data.qualification); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Qualification failed."); }
    finally { setLoading(false); }
  }

  async function review(decision: "accepted" | "dismissed") {
    if (!qualification) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/qualification`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualificationId: qualification.id, decision }),
      });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "Review failed.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Review failed."); }
    finally { setLoading(false); }
  }

  async function createPlan() {
    if (!qualification) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/follow-up`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualificationId: qualification.id }),
      });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "Plan creation failed.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Plan creation failed."); }
    finally { setLoading(false); }
  }

  async function updateAction(actionId: string, decision: "approved" | "completed" | "cancelled") {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/follow-up`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId, decision }),
      });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "Action update failed.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Action update failed."); }
    finally { setLoading(false); }
  }

  return <section className="border-b border-slate-800/80 bg-cyan-950/15 px-6 py-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <BrainCircuit className="h-4 w-4 text-cyan-300" />
      <span className="font-semibold text-slate-200">Lead Intelligence & Next Best Action</span>
      <span className="text-slate-500">AI recommends; humans decide and approve follow-ups.</span>
      <button type="button" onClick={() => void generate()} disabled={disabled || loading}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-cyan-700/60 px-2.5 py-1 text-cyan-200 hover:bg-cyan-900/30 disabled:opacity-50">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />} {qualification ? "Re-evaluate" : "Qualify lead"}
      </button>
    </div>
    {qualification && <div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr]">
      <div className="rounded-xl border border-cyan-800/50 bg-slate-950/70 p-3 text-center">
        <div className="text-2xl font-bold text-cyan-300">{qualification.score}</div><div className="text-slate-500">/100</div>
        <div className="mt-1 capitalize text-slate-300">{qualification.temperature} · {qualification.intent}</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="text-slate-300">{qualification.summary}</p>
        <p className="mt-2 text-cyan-200"><strong>Next:</strong> {qualification.next_best_action || qualification.nextBestAction}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {qualification.status === "suggested" && <>
            <button disabled={disabled || loading} onClick={() => void review("accepted")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-white"><Check className="h-3 w-3" /> Accept</button>
            <button disabled={disabled || loading} onClick={() => void review("dismissed")} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-slate-300"><X className="h-3 w-3" /> Dismiss</button>
          </>}
          {qualification.status === "accepted" && !plan && <button disabled={disabled || loading} onClick={() => void createPlan()} className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-2 py-1 text-white"><Play className="h-3 w-3" /> Create approved follow-up plan</button>}
          <span className="capitalize text-slate-500">Status: {qualification.status}</span>
        </div>
      </div>
    </div>}
    {plan && <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-cyan-300" /><strong className="text-slate-200">Follow-up plan</strong><span className="text-slate-500">{plan.strategy} · {plan.status}</span></div>
      <div className="mt-2 space-y-1.5">{plan.actions.map((action) => <div key={action.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-2">
        <span className="font-medium capitalize text-slate-300">{action.action_type.replaceAll("_", " ")}</span><span className="text-slate-500">{new Date(action.scheduled_for).toLocaleString()}</span><span className="capitalize text-slate-500">{action.status.replaceAll("_", " ")}</span>
        <div className="ml-auto flex gap-1">{action.status === "approval_required" && <button disabled={disabled || loading} onClick={() => void updateAction(action.id, "approved")} className="rounded bg-emerald-800 px-2 py-1 text-emerald-100">Approve</button>}{action.status === "approved" && <button disabled={disabled || loading} onClick={() => void updateAction(action.id, "completed")} className="rounded bg-cyan-800 px-2 py-1 text-cyan-100">Complete</button>}{!["completed","cancelled"].includes(action.status) && <button disabled={disabled || loading} onClick={() => void updateAction(action.id, "cancelled")} className="rounded border border-slate-700 px-2 py-1 text-slate-400">Cancel</button>}</div>
      </div>)}</div>
    </div>}
    {error && <div className="mt-2 text-rose-300">{error}</div>}
  </section>;
}
