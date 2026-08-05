"use client";

import React, { useState, useTransition } from "react";
import { ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { MessageTimeline } from "@/components/inbox/message-timeline";
import { updateConversationStatusAction, updateConversationAssigneeAction } from "@/app/(app)/inbox/actions";
import {
  User,
  AlertTriangle,
  Send,
  Lock,
  WifiOff,
  Loader2,
} from "lucide-react";

interface ConversationViewProps {
  conversation: ConversationDetailDTO | null;
  isLoading: boolean;
  userRole: string;
  isDemo: boolean;
  organizationMembers: Array<{ userId: string; name: string; email: string }>;
  onRefresh?: () => void;
}

export function ConversationView({
  conversation,
  isLoading,
  userRole,
  isDemo,
  organizationMembers,
  onRefresh,
}: ConversationViewProps) {
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 p-8 text-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Loading conversation messages...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 p-8 text-center text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
          <MessageSquareIcon className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No conversation selected</h3>
        <p className="text-xs max-w-sm text-slate-400">
          Select a WhatsApp conversation from the left sidebar to view messages, update status, or assign team members.
        </p>
      </div>
    );
  }

  const isReadOnly = userRole === "viewer" || isDemo;
  const isDisconnected = conversation.connectionStatus !== "connected";

  const handleStatusChange = (newStatus: "open" | "pending" | "resolved" | "closed") => {
    setActionError(null);
    startTransition(async () => {
      const res = await updateConversationStatusAction(conversation.id, newStatus);
      if (!res.success) {
        setActionError(res.error || "Failed to update status.");
      } else if (onRefresh) {
        onRefresh();
      }
    });
  };

  const handleAssigneeChange = (newAssigneeId: string) => {
    setActionError(null);
    const assignedUserId = newAssigneeId === "unassigned" ? null : newAssigneeId;
    startTransition(async () => {
      const res = await updateConversationAssigneeAction(conversation.id, assignedUserId);
      if (!res.success) {
        setActionError(res.error || "Failed to update assignee.");
      } else if (onRefresh) {
        onRefresh();
      }
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-950/70 border-l border-slate-800/60">
      {/* Conversation Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-bold text-base">
            {conversation.contactName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-slate-100">{conversation.contactName}</h3>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                WhatsApp
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {conversation.contactMaskedPhone || "+90 532 *** ** **"}
            </p>
          </div>
        </div>

        {/* Header Controls (Status & Assignee Selectors) */}
        <div className="flex items-center space-x-3">
          {/* Assignee Selector */}
          <div className="relative flex items-center">
            <User className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={conversation.assignedUserId || "unassigned"}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={isReadOnly || isPending}
              className="appearance-none bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="unassigned">Unassigned</option>
              {organizationMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div className="relative">
            <select
              value={conversation.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as "open" | "pending" | "resolved" | "closed")
              }
              disabled={isReadOnly || isPending}
              className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer capitalize"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Warning Banners */}
      {isDisconnected && (
        <div className="flex items-center space-x-2 bg-amber-950/50 border-b border-amber-800/40 px-6 py-2.5 text-xs text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>WhatsApp channel is currently disconnected or expired. Incoming replies are paused.</span>
        </div>
      )}

      {isReadOnly && (
        <div className="flex items-center space-x-2 bg-slate-900 border-b border-slate-800 px-6 py-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{isDemo ? "Demo mode is active (read-only)." : "You have read-only access to this conversation."}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between bg-rose-950/60 border-b border-rose-800/40 px-6 py-2 text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-rose-200 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <MessageTimeline messages={conversation.messages} />
      </div>

      {/* Composer Box */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder={
              isReadOnly
                ? "Read-only mode active"
                : isDisconnected
                ? "Channel disconnected"
                : "Type outbound message reply..."
            }
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            disabled={isReadOnly || isDisconnected}
            className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            disabled={isReadOnly || isDisconnected || !replyText.trim()}
            className="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}
