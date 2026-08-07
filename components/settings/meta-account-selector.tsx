"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type Candidate = { externalId: string; username: string | null; displayName: string | null; selected: boolean };

export function MetaAccountSelector({ provider }: { provider: "instagram" | "facebook" }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/integrations/meta/accounts?provider=${provider}`, { cache: "no-store" })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.message || "Could not load accounts."); setCandidates(data.candidates || []); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts."))
      .finally(() => setLoading(false));
  }, [provider]);

  async function select(externalAccountId: string) {
    setSelecting(externalAccountId); setError(null);
    try {
      const response = await fetch("/api/integrations/meta/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, externalAccountId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Account selection failed.");
      window.location.assign(`/settings/integrations?connected=${provider}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Account selection failed."); setSelecting(null); }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Meta accounts…</div>;
  return <div className="space-y-3">
    {candidates.map((candidate) => <button key={candidate.externalId} type="button" onClick={() => void select(candidate.externalId)} disabled={Boolean(selecting)}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/5">
      <div className="min-w-0 flex-1"><div className="font-medium text-slate-900 dark:text-white">{candidate.displayName || candidate.externalId}</div><div className="text-xs text-slate-500">{candidate.username ? `@${candidate.username}` : candidate.externalId}</div></div>
      {candidate.selected ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : selecting === candidate.externalId ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-xs font-semibold text-blue-600">Select</span>}
    </button>)}
    {candidates.length === 0 && <p className="text-sm text-slate-500">No eligible messaging account was found. Confirm the Meta user has access to the Page and linked professional Instagram account.</p>}
    {error && <p className="text-sm text-rose-600">{error}</p>}
  </div>;
}
