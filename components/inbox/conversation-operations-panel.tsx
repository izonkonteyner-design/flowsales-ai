"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FilePlus2, History, Loader2, RefreshCw, StickyNote, UserCheck } from "lucide-react";
import type { ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";

type AuditRow = { id: string; event_type: string; metadata: Record<string, unknown>; created_at: string };

export function ConversationOperationsPanel({ conversation, disabled, onRefresh }: {
  conversation: ConversationDetailDTO;
  disabled: boolean;
  onRefresh?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const failed = conversation.messages.filter((m) => m.direction === "outbound" && m.status === "failed" && m.messageType === "text");

  async function loadAudit() {
    const res = await fetch(`/api/inbox/conversations/${conversation.id}/operations`, { cache: "no-store" });
    if (res.ok) setAudit(((await res.json())?.audit || []) as AuditRow[]);
  }

  useEffect(() => { void loadAudit(); }, [conversation.id]);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    if (disabled || busy) return;
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversation.id}/operations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.error || data?.message || "Operation failed.");
      if (data?.quoteId) setNotice(`Draft quote created: ${data.quoteId}`);
      else if (data?.taskId) setNotice("Follow-up task created.");
      else if (data?.customerId) setNotice("Lead converted to Customer.");
      else setNotice("Operation completed.");
      await loadAudit();
      onRefresh?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operation failed.");
    } finally { setBusy(null); }
  }

  function addNote() {
    const detail = window.prompt("CRM note to add from this WhatsApp conversation:");
    if (detail?.trim()) void run("add_note", { detail });
  }

  return (
    <section className="border-b border-slate-800/80 bg-slate-950/70 px-6 py-3 text-xs" aria-label="WhatsApp CRM operations and audit">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-200">CRM Actions</span>
        <button disabled={disabled || !!busy} onClick={addNote} className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"><StickyNote className="mr-1 inline h-3 w-3"/>Add Note</button>
        <button disabled={disabled || !!busy} onClick={() => void run("create_follow_up")} className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"><ClipboardList className="mr-1 inline h-3 w-3"/>Follow-up</button>
        <button disabled={disabled || !!busy} onClick={() => void run("create_quote")} className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"><FilePlus2 className="mr-1 inline h-3 w-3"/>Draft Quote</button>
        <button disabled={disabled || !!busy} onClick={() => void run("convert_lead")} className="rounded-lg border border-emerald-800 px-2.5 py-1 text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"><UserCheck className="mr-1 inline h-3 w-3"/>Convert Lead</button>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400"/>}
      </div>

      {failed.length > 0 && (
        <div className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/20 p-3">
          <p className="font-semibold text-rose-300">Failed outbound messages</p>
          {failed.slice(-5).map((message) => (
            <div key={message.id} className="mt-2 flex items-center justify-between gap-3 text-slate-300">
              <span className="truncate">{message.body || "Failed text message"}</span>
              <button disabled={disabled || !!busy} onClick={() => void run("retry_message", { messageId: message.id })} className="shrink-0 rounded-lg border border-rose-800 px-2 py-1 text-rose-300 hover:bg-rose-950 disabled:opacity-50"><RefreshCw className="mr-1 inline h-3 w-3"/>Retry manually</button>
            </div>
          ))}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer select-none font-semibold text-slate-300"><History className="mr-1 inline h-3.5 w-3.5"/>Audit history ({audit.length})</summary>
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
          {audit.length === 0 ? <p className="text-slate-500">No audited operations yet.</p> : audit.map((row) => (
            <div key={row.id} className="flex justify-between gap-3 border-b border-slate-900 py-1 last:border-0">
              <span className="text-slate-300">{row.event_type.replaceAll("_", " ")}</span>
              <span className="shrink-0 text-slate-500">{new Date(row.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </details>
      {notice && <p className="mt-2 text-sky-300">{notice}</p>}
    </section>
  );
}
