"use client";

import React, { useState, useTransition } from "react";
import { ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { MessageTimeline } from "@/components/inbox/message-timeline";
import { updateConversationAssigneeAction, updateConversationStatusAction } from "@/app/(app)/inbox/actions";
import { Loader2, Lock, Send, User, WifiOff } from "lucide-react";

export function MetaConversationView({ conversation, isLoading, userRole, isDemo, organizationMembers, onRefresh }: {
  conversation: ConversationDetailDTO | null;
  isLoading: boolean;
  userRole: string;
  isDemo: boolean;
  organizationMembers: Array<{ userId: string; name: string; email: string }>;
  onRefresh?: () => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading conversation…</div>;
  if (!conversation) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a conversation.</div>;

  const isReadOnly = userRole === "viewer" || isDemo;
  const isDisconnected = conversation.connectionStatus !== "connected";
  const providerLabel = conversation.provider === "instagram" ? "Instagram DM" : "Facebook Messenger";

  const handleStatus = (status: "open" | "pending" | "resolved" | "closed") => startTransition(async () => {
    const result = await updateConversationStatusAction(conversation.id, status);
    if (!result.success) setActionError(result.error || "Failed to update status."); else onRefresh?.();
  });
  const handleAssignee = (value: string) => startTransition(async () => {
    const result = await updateConversationAssigneeAction(conversation.id, value === "unassigned" ? null : value);
    if (!result.success) setActionError(result.error || "Failed to update assignee."); else onRefresh?.();
  });
  const handleSend = async () => {
    if (!replyText.trim() || isReadOnly || isDisconnected || isSending) return;
    setIsSending(true); setSendError(null);
    try {
      const response = await fetch(`/api/inbox/conversations/${conversation.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim(), clientIdempotencyKey: crypto.randomUUID() }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) setSendError(json?.message || "Failed to send message.");
      else { setReplyText(""); onRefresh?.(); }
    } catch { setSendError("Network error while sending message."); }
    finally { setIsSending(false); }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950/70 border-l border-slate-800/60">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-6 py-4">
        <div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-slate-100">{conversation.contactName}</h3><span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">{providerLabel}</span></div><p className="mt-1 text-xs text-slate-400">Unified FlowSales conversation</p></div>
        <div className="flex items-center gap-2">
          <div className="relative"><User className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><select value={conversation.assignedUserId || "unassigned"} onChange={(e) => handleAssignee(e.target.value)} disabled={isReadOnly || isPending} className="rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-200"><option value="unassigned">Unassigned</option>{organizationMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div>
          <select value={conversation.status} onChange={(e) => handleStatus(e.target.value as "open" | "pending" | "resolved" | "closed")} disabled={isReadOnly || isPending} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        </div>
      </div>
      {isDisconnected && <div className="flex items-center gap-2 border-b border-amber-800/40 bg-amber-950/50 px-6 py-2.5 text-xs text-amber-300"><WifiOff className="h-4 w-4" />{providerLabel} connection is unavailable. Reconnect it in Integrations.</div>}
      {isReadOnly && <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-6 py-2 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" />Read-only access.</div>}
      {(sendError || actionError) && <div className="border-b border-rose-800/40 bg-rose-950/60 px-6 py-2 text-xs text-rose-300">{sendError || actionError}</div>}
      <div className="flex-1 overflow-y-auto p-6"><MessageTimeline messages={conversation.messages} /></div>
      <form onSubmit={(event) => { event.preventDefault(); void handleSend(); }} className="flex gap-2 border-t border-slate-800/80 bg-slate-900/40 p-4">
        <input value={replyText} onChange={(e) => setReplyText(e.target.value)} disabled={isReadOnly || isDisconnected || isSending} placeholder={isDisconnected ? "Channel disconnected" : `Reply via ${providerLabel}…`} className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 disabled:opacity-50" />
        <button type="submit" disabled={isReadOnly || isDisconnected || isSending || !replyText.trim()} className="flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{isSending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Send</button>
      </form>
    </div>
  );
}
