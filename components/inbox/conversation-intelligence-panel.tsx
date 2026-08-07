"use client";

import React, { useEffect, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, Check, X } from "lucide-react";

type Intelligence = {
  intent: string;
  qualification_score?: number;
  qualificationScore?: number;
  confidence: number;
  urgency: string;
  next_best_action?: string;
  nextBestAction?: string;
  rationale: string;
  signals: string[];
  review_status?: string;
};

export function ConversationIntelligencePanel({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [item, setItem] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch(`/api/inbox/conversations/${conversationId}/intelligence`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    setItem(json?.intelligence ?? null);
  };
  useEffect(() => { void load(); }, [conversationId]);

  const analyze = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/intelligence`, { method: "POST" });
      const json = await response.json().catch(() => null);
      if (!response.ok) setError(json?.message || "AI analysis failed."); else setItem(json.intelligence);
    } catch { setError("AI analysis request failed."); }
    finally { setLoading(false); }
  };
  const review = async (status: "accepted" | "dismissed") => {
    const response = await fetch(`/api/inbox/conversations/${conversationId}/intelligence`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) await load();
  };

  const score = item?.qualificationScore ?? item?.qualification_score ?? 0;
  const nba = item?.nextBestAction ?? item?.next_best_action ?? "";
  return (
    <section className="border-b border-slate-800/70 bg-slate-950/80 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><BrainCircuit className="h-4 w-4 shrink-0 text-violet-400" /><div className="min-w-0"><p className="text-xs font-semibold text-slate-200">AI Lead Qualification & Next Best Action</p>{item ? <p className="truncate text-[11px] text-slate-400">{item.intent} · Score {score}/100 · {item.urgency}</p> : <p className="text-[11px] text-slate-500">Advisory only — no automatic CRM or customer action.</p>}</div></div>
        <button type="button" onClick={() => void analyze()} disabled={disabled || loading} className="flex shrink-0 items-center rounded-lg border border-violet-500/30 px-2.5 py-1.5 text-[11px] font-medium text-violet-300 disabled:opacity-50">{loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}{item ? "Re-analyze" : "Analyze"}</button>
      </div>
      {item && <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-slate-500">Next best action</p><p className="mt-0.5 text-xs text-slate-200">{nba}</p>{item.rationale && <p className="mt-1 text-[11px] text-slate-400">{item.rationale}</p>}</div><div className="flex shrink-0 gap-1"><button title="Accept suggestion" disabled={disabled} onClick={() => void review("accepted")} className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"><Check className="h-4 w-4" /></button><button title="Dismiss suggestion" disabled={disabled} onClick={() => void review("dismissed")} className="rounded-md p-1.5 text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"><X className="h-4 w-4" /></button></div></div>}
      {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
    </section>
  );
}
