"use client";

import { useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, Clock, Loader2, Lock, Send, User, WifiOff } from "lucide-react";
import { MessageTimeline } from "@/components/inbox/message-timeline";
import type { ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { validateCustomerWindow } from "@/lib/utils/customer-window";
import { updateConversationAssigneeAction, updateConversationStatusAction } from "@/app/(app)/inbox/actions";

interface Props {
  conversation: ConversationDetailDTO;
  userRole: string;
  isDemo: boolean;
  organizationMembers: Array<{ userId: string; name: string; email: string }>;
  onRefresh?: () => void;
}

export function MetaConversationView({ conversation, userRole, isDemo, organizationMembers, onRefresh }: Props) {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const channelLabel = conversation.provider === "instagram" ? "Instagram" : "Messenger";
  const isReadOnly = userRole === "viewer" || isDemo;
  const isDisconnected = conversation.connectionStatus !== "connected";
  const lastInbound = [...conversation.messages].reverse().find((message) => message.direction === "inbound");
  const standardWindow = validateCustomerWindow(lastInbound?.sentAt || lastInbound?.createdAt);
  const canReply = !isReadOnly && !isDisconnected && standardWindow.allowed;

  function updateStatus(status: "open" | "pending" | "resolved" | "closed") {
    setActionError(null);
    startTransition(async () => {
      const result = await updateConversationStatusAction(conversation.id, status);
      if (!result.success) setActionError(result.error || "Failed to update conversation status.");
      else onRefresh?.();
    });
  }

  function updateAssignee(value: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await updateConversationAssigneeAction(conversation.id, value === "unassigned" ? null : value);
      if (!result.success) setActionError(result.error || "Failed to update assignee.");
      else onRefresh?.();
    });
  }

  async function sendReply() {
    const text = replyText.trim();
    if (!text || !canReply || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const clientIdempotencyKey = crypto.randomUUID();
      const response = await fetch(`/api/inbox/conversations/${conversation.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, clientIdempotencyKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `${channelLabel} reply could not be sent.`);
      setReplyText("");
      onRefresh?.();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : `${channelLabel} reply could not be sent.`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-slate-800/60 bg-slate-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-bold text-slate-200">
            {conversation.contactName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{conversation.contactName}</h3>
              <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">{channelLabel}</span>
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${standardWindow.allowed ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                <Clock className="mr-1 h-3 w-3" /> {standardWindow.allowed ? "24h Standard Window Open" : "24h Standard Window Closed"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Provider contact ID is kept tenant-scoped by FlowSales.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <User className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <select value={conversation.assignedUserId || "unassigned"} onChange={(event) => updateAssignee(event.target.value)} disabled={isReadOnly || isPending}
              className="appearance-none rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-7 text-xs text-slate-200 disabled:opacity-60">
              <option value="unassigned">Unassigned</option>
              {organizationMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
            </select>
          </div>
          <select value={conversation.status} onChange={(event) => updateStatus(event.target.value as "open" | "pending" | "resolved" | "closed")} disabled={isReadOnly || isPending}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs capitalize text-slate-200 disabled:opacity-60">
            <option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {!standardWindow.allowed && !isDisconnected && (
        <div className="flex items-center gap-2 border-b border-amber-800/40 bg-amber-950/50 px-6 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span><strong>{channelLabel} standard messaging window closed.</strong> FlowSales will not send a standard reply outside the 24-hour window. No HUMAN_AGENT or automated bypass is used.</span>
        </div>
      )}
      {isDisconnected && <div className="flex items-center gap-2 border-b border-amber-800/40 bg-amber-950/50 px-6 py-2.5 text-xs text-amber-300"><WifiOff className="h-4 w-4" /> {channelLabel} channel is disconnected or expired. Outbound replies are paused.</div>}
      {isReadOnly && <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-6 py-2 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> {isDemo ? "Demo mode is active (read-only)." : "You have read-only access to this conversation."}</div>}
      {sendError && <div className="flex items-center gap-2 border-b border-rose-800/40 bg-rose-950/60 px-6 py-2.5 text-xs text-rose-200"><AlertCircle className="h-4 w-4" /> {sendError}</div>}
      {actionError && <div className="flex items-center gap-2 border-b border-rose-800/40 bg-rose-950/60 px-6 py-2 text-xs text-rose-300"><AlertTriangle className="h-3.5 w-3.5" /> {actionError}</div>}

      <div className="flex-1 space-y-4 overflow-y-auto p-6"><MessageTimeline messages={conversation.messages} /></div>

      <div className="border-t border-slate-800/80 bg-slate-900/40 p-4">
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
          <input type="text" value={replyText} onChange={(event) => setReplyText(event.target.value)} disabled={!canReply || isSending}
            placeholder={isReadOnly ? "Read-only mode active" : isDisconnected ? "Channel disconnected" : !standardWindow.allowed ? "24-hour standard messaging window closed" : `Type ${channelLabel} reply...`}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 disabled:opacity-50" />
          <button type="submit" disabled={!canReply || isSending || !replyText.trim()}
            className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            {isSending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send
          </button>
        </form>
      </div>
    </div>
  );
}
