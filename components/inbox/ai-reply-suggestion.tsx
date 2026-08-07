"use client";

import { useState } from "react";
import { Bot, Check, Copy, Loader2, RefreshCw, X } from "lucide-react";

export function AiReplySuggestion({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function auditReview(decision: "copied" | "dismissed") {
    await fetch(`/api/inbox/conversations/${conversationId}/operations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_ai", decision }),
    }).catch(() => null);
  }

  async function generate() {
    if (disabled || loading) return;
    setLoading(true); setError(null); setCopied(false);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/ai-suggestion`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.suggestion) throw new Error(data?.message || "AI reply suggestion could not be generated.");
      setSuggestion(String(data.suggestion));
    } catch (err) { setError(err instanceof Error ? err.message : "AI reply suggestion could not be generated."); }
    finally { setLoading(false); }
  }

  async function copySuggestion() {
    if (!suggestion) return;
    await navigator.clipboard.writeText(suggestion);
    setCopied(true);
    await auditReview("copied");
  }

  async function dismissSuggestion() {
    setSuggestion(null);
    await auditReview("dismissed");
  }

  return (
    <div className="border-b border-slate-800/80 bg-violet-950/20 px-6 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-violet-300" /><span className="font-semibold text-slate-200">AI Reply Draft</span>
        <span className="text-slate-500">Draft only — never auto-sends.</span>
        <button type="button" onClick={() => void generate()} disabled={disabled || loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-violet-700/60 px-2.5 py-1 text-violet-200 hover:bg-violet-900/40 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : suggestion ? <RefreshCw className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
          {suggestion ? "Regenerate" : "Suggest reply"}
        </button>
      </div>
      {suggestion && <div className="mt-2 rounded-xl border border-violet-800/50 bg-slate-950/80 p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{suggestion}</p>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" onClick={() => void dismissSuggestion()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800"><X className="h-3 w-3" /> Dismiss</button>
          <button type="button" onClick={() => void copySuggestion()} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 font-semibold text-white hover:bg-violet-500">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copied — review before sending" : "Copy for review"}
          </button>
        </div>
      </div>}
      {error && <div className="mt-2 text-rose-300">{error}</div>}
    </div>
  );
}
