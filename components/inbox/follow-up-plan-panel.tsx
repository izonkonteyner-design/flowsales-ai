"use client";

import React, { useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus } from "lucide-react";

type Step = { id: string; step_order: number; action_type: string; channel: string | null; due_at: string; status: string; requires_human_approval: boolean };
type Plan = { id: string; name: string; status: string; created_at: string; sales_follow_up_steps?: Step[] };

export function FollowUpPlanPanel({ conversationId, provider, disabled }: { conversationId: string; provider: string; disabled: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const response = await fetch(`/api/inbox/conversations/${conversationId}/follow-ups`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    setPlans(json?.plans ?? []);
  };
  useEffect(() => { void load(); }, [conversationId]);

  const createReviewPlan = async () => {
    setLoading(true); setError(null);
    const channel = ["whatsapp", "instagram", "facebook"].includes(provider) ? provider : null;
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sales follow-up review",
          steps: [
            { delayHours: 24, actionType: "task", channel: null },
            { delayHours: 48, actionType: "message_draft", channel },
            { delayHours: 72, actionType: "call", channel: null },
          ],
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) setError(json?.message || "Failed to create follow-up plan."); else await load();
    } catch { setError("Follow-up request failed."); }
    finally { setLoading(false); }
  };

  const active = plans.find((plan) => plan.status === "active") ?? null;
  return (
    <section className="border-b border-slate-800/70 bg-slate-950/80 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0 text-cyan-400" /><div className="min-w-0"><p className="text-xs font-semibold text-slate-200">Sales Follow-up Engine</p><p className="truncate text-[11px] text-slate-500">{active ? `${active.name} · ${active.sales_follow_up_steps?.length ?? 0} human-approved steps` : "No active plan. Nothing is auto-sent."}</p></div></div>
        <button type="button" onClick={() => void createReviewPlan()} disabled={disabled || loading || Boolean(active)} className="flex shrink-0 items-center rounded-lg border border-cyan-500/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-300 disabled:opacity-50">{loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}Create review plan</button>
      </div>
      {active && <div className="mt-2 flex flex-wrap gap-1.5">{(active.sales_follow_up_steps ?? []).sort((a,b) => a.step_order-b.step_order).map((step) => <span key={step.id} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">{step.step_order}. {step.action_type.replace("_", " ")} · {step.status}</span>)}</div>}
      {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
    </section>
  );
}
