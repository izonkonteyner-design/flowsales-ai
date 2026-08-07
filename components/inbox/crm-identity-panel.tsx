"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Search, UserPlus, XCircle } from "lucide-react";
import type { CrmSearchResults, WhatsAppIdentityDTO } from "@/server/services/whatsapp-crm-identity";

interface Props {
  conversationId: string | null;
  isReadOnly: boolean;
  onChanged?: () => void;
}

const EMPTY_SEARCH: CrmSearchResults = { customers: [], leads: [] };

export function CrmIdentityPanel({ conversationId, isReadOnly, onChanged }: Props) {
  const [identity, setIdentity] = useState<WhatsAppIdentityDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CrmSearchResults>(EMPTY_SEARCH);

  async function loadIdentity() {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/identity`, { cache: "no-store" });
      if (!res.ok) throw new Error("CRM identity could not be loaded.");
      setIdentity(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM identity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    fetch(`/api/inbox/conversations/${conversationId}/identity`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("CRM identity could not be loaded.");
        return (await res.json()) as WhatsAppIdentityDTO;
      })
      .then((data) => {
        if (cancelled) return;
        setIdentity(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "CRM identity could not be loaded.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function mutate(body: Record<string, unknown>) {
    if (!conversationId || isReadOnly || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "CRM identity update failed.");
      await loadIdentity();
      setSearchQuery("");
      setSearchResults(EMPTY_SEARCH);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM identity update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function searchExisting() {
    if (!conversationId || searchQuery.trim().length < 2 || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversationId}/identity?q=${encodeURIComponent(searchQuery.trim())}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("CRM search failed.");
      setSearchResults(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM search failed.");
    } finally {
      setSearching(false);
    }
  }

  if (!conversationId) return null;

  if (loading && !identity) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/70 px-6 py-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving CRM identity…
      </div>
    );
  }

  if (!identity) {
    return error ? (
      <div className="border-b border-rose-900/50 bg-rose-950/40 px-6 py-2 text-xs text-rose-300">{error}</div>
    ) : null;
  }

  const matchedCustomer = identity.customer;
  const matchedLead = identity.lead;
  const ambiguous = identity.status === "AMBIGUOUS";
  const unmatched = identity.status === "UNMATCHED";
  const manuallyResolved = identity.status === "MANUALLY_RESOLVED";
  const needsResolution = ambiguous || unmatched;

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/70 px-6 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {ambiguous ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" /> : unmatched ? <XCircle className="h-4 w-4 shrink-0 text-slate-400" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="font-semibold text-slate-200">CRM Identity</span>
          <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{identity.status}</span>
          {manuallyResolved && <span className="text-[10px] text-sky-400">manual</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {matchedCustomer && <Link href={`/customers/${matchedCustomer.id}`} className="rounded-lg bg-emerald-600/15 px-2.5 py-1 text-emerald-300 hover:bg-emerald-600/25">Customer: {matchedCustomer.name}</Link>}
          {!matchedCustomer && matchedLead && <Link href={`/leads/${matchedLead.id}`} className="rounded-lg bg-sky-600/15 px-2.5 py-1 text-sky-300 hover:bg-sky-600/25">Lead: {matchedLead.name}</Link>}
          {(matchedCustomer || matchedLead || manuallyResolved) && !isReadOnly && <button onClick={() => void mutate({ action: "unlink" })} disabled={saving} className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50">Unlink</button>}
        </div>
      </div>

      {needsResolution && (
        <div className="mt-3 space-y-3">
          <p className="text-slate-400">{ambiguous ? "More than one CRM record matches this WhatsApp phone. Select the correct record; no automatic choice will be made." : "No exact CRM match was found. Create a Lead or explicitly link an existing CRM record."}</p>

          {identity.candidates.customers.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">Exact customers:</span>{identity.candidates.customers.map((candidate) => <button key={candidate.id} disabled={isReadOnly || saving} onClick={() => void mutate({ action: "link_customer", customerId: candidate.id })} className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50"><Link2 className="h-3 w-3" /> {candidate.name} · {candidate.maskedPhone}</button>)}</div>}

          {identity.candidates.leads.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">Exact leads:</span>{identity.candidates.leads.map((candidate) => <button key={candidate.id} disabled={isReadOnly || saving} onClick={() => void mutate({ action: "link_lead", leadId: candidate.id })} className="inline-flex items-center gap-1 rounded-lg border border-sky-800/60 bg-sky-950/30 px-2.5 py-1 text-sky-300 hover:bg-sky-900/40 disabled:opacity-50"><Link2 className="h-3 w-3" /> {candidate.name} · {candidate.maskedPhone}</button>)}</div>}

          {!isReadOnly && <div className="flex flex-wrap items-center gap-2">
            {unmatched && <button disabled={saving} onClick={() => void mutate({ action: "create_lead" })} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Create Lead from WhatsApp</button>}
            <div className="flex min-w-[280px] flex-1 items-center gap-2">
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchExisting(); } }} placeholder="Search existing lead/customer by name or phone" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none" />
              <button type="button" disabled={searchQuery.trim().length < 2 || searching} onClick={() => void searchExisting()} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50">{searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}Search</button>
            </div>
          </div>}

          {(searchResults.customers.length > 0 || searchResults.leads.length > 0) && <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
            {searchResults.customers.map((candidate) => <button key={`customer-${candidate.id}`} disabled={saving} onClick={() => void mutate({ action: "link_customer", customerId: candidate.id })} className="mr-2 inline-flex items-center gap-1 rounded-lg border border-emerald-800/60 px-2.5 py-1 text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50">Customer · {candidate.name} · {candidate.maskedPhone}</button>)}
            {searchResults.leads.map((candidate) => <button key={`lead-${candidate.id}`} disabled={saving} onClick={() => void mutate({ action: "link_lead", leadId: candidate.id })} className="mr-2 inline-flex items-center gap-1 rounded-lg border border-sky-800/60 px-2.5 py-1 text-sky-300 hover:bg-sky-950/50 disabled:opacity-50">Lead · {candidate.name} · {candidate.maskedPhone}</button>)}
          </div>}
        </div>
      )}

      {error && <div className="mt-2 text-rose-300">{error}</div>}
    </div>
  );
}
