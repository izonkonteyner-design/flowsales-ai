"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardPlus, FilePlus2, RefreshCcw, UserRoundCheck } from "lucide-react";

interface IdentityShape {
  lead?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
}

export function CrmConversationActions({ conversationId, disabled, onChanged }: {
  conversationId: string; disabled: boolean; onChanged?: () => void;
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/inbox/conversations/${conversationId}/identity`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (mounted) setIdentity(data); })
      .catch(() => { if (mounted) setIdentity(null); });
    return () => { mounted = false; };
  }, [conversationId]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/crm-actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "CRM action failed.");
      setMessage("Saved"); onChanged?.(); return json;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM action failed."); return null;
    } finally { setBusy(false); }
  };

  const addNote = async () => {
    const note = window.prompt("Add a CRM note from this conversation:");
    if (note?.trim()) await post({ action: "add_note", note: note.trim() });
  };

  const createFollowUp = async () => {
    const title = window.prompt("Follow-up task title:", "Follow up on this customer conversation");
    if (!title?.trim()) return;
    const defaultDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const dueAt = window.prompt("Due date/time (YYYY-MM-DDTHH:mm):", defaultDue);
    if (!dueAt) return;
    await post({ action: "create_task", title: title.trim(), dueAt, priority: "medium" });
  };

  const convert = async () => {
    if (!identity?.lead) return;
    if (!window.confirm(`Convert ${identity.lead.name} to a Customer?`)) return;
    const result = await post({ action: "convert_lead" });
    if (result) {
      const refreshed = await fetch(`/api/inbox/conversations/${conversationId}/identity`, { cache: "no-store" });
      if (refreshed.ok) setIdentity(await refreshed.json());
    }
  };

  const openQuote = async () => {
    const result = await post({ action: "open_quote" });
    if (result?.leadId) router.push(`/quotes/new?leadId=${encodeURIComponent(result.leadId)}&conversationId=${encodeURIComponent(conversationId)}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/70 bg-slate-950/80 px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">CRM actions</span>
      <button disabled={disabled || busy} onClick={addNote} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-50"><ClipboardPlus className="mr-1 inline h-3 w-3" /> Note</button>
      <button disabled={disabled || busy} onClick={createFollowUp} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-3 w-3" /> Follow-up</button>
      <button disabled={disabled || busy || !identity?.lead} onClick={convert} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-50"><UserRoundCheck className="mr-1 inline h-3 w-3" /> Convert</button>
      <button disabled={disabled || busy || !identity?.lead} onClick={openQuote} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-50"><FilePlus2 className="mr-1 inline h-3 w-3" /> Create quote</button>
      {busy && <RefreshCcw className="h-3 w-3 animate-spin text-slate-500" />}
      {message && <span className="max-w-xs truncate text-[10px] text-slate-400">{message}</span>}
    </div>
  );
}
