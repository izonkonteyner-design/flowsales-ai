"use client";

import React from "react";
import { ConversationSummaryDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { User, Clock, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";

interface ConversationItemProps {
  conversation: ConversationSummaryDTO;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function ConversationItem({ conversation, isSelected, onSelect }: ConversationItemProps) {
  const {
    id,
    contactName,
    contactMaskedPhone,
    lastMessageSnippet,
    lastMessageAt,
    unreadCount,
    status,
    assignedUserName,
  } = conversation;

  return (
    <div
      onClick={() => onSelect(id)}
      className={`group relative flex cursor-pointer items-start space-x-3 rounded-lg p-3 transition-colors border ${
        isSelected
          ? "bg-muted border-border font-medium shadow-xs"
          : "bg-card border-border/60 hover:bg-muted/40"
      }`}
    >
      {/* Avatar / Icon */}
      <div className="relative shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted border border-border text-foreground font-bold text-xs">
          {contactName ? contactName.slice(0, 2).toUpperCase() : "WA"}
        </div>
        {/* WhatsApp Provider Badge */}
        <div
          className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-bold text-white shadow-xs"
          title="WhatsApp Business"
        >
          W
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between space-x-1">
          <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {contactName}
          </h4>
          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center">
            <Clock className="h-2.5 w-2.5 mr-0.5 opacity-60" />
            {formatRelativeTime(lastMessageAt)}
          </span>
        </div>

        <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
          {contactMaskedPhone || "+90 532 *** ** **"}
        </p>

        <p className="text-xs text-muted-foreground truncate mt-1 line-clamp-1">
          {lastMessageSnippet || <span className="italic text-muted-foreground/60">Mesaj içeriği yok</span>}
        </p>

        <div className="mt-2 flex items-center justify-between text-[10px]">
          {/* Status Badge */}
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium border text-[10px] ${getStatusBadgeStyle(
              status
            )}`}
          >
            {getStatusIcon(status)}
            <span className="ml-1 capitalize">{status}</span>
          </span>

          {/* Assignee & Unread Count */}
          <div className="flex items-center space-x-1.5">
            {assignedUserName && (
              <span className="text-muted-foreground truncate max-w-[90px] flex items-center text-[10px]">
                <User className="h-2.5 w-2.5 mr-0.5 opacity-60 shrink-0" />
                <span className="truncate">{assignedUserName}</span>
              </span>
            )}

            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-bold text-[9px] text-primary-foreground shadow-xs">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusBadgeStyle(status: ConversationSummaryDTO["status"]) {
  switch (status) {
    case "open":
      return "bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40";
    case "pending":
      return "bg-amber-50 text-amber-800 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40";
    case "resolved":
      return "bg-blue-50 text-blue-800 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40";
    case "closed":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getStatusIcon(status: ConversationSummaryDTO["status"]) {
  switch (status) {
    case "open":
      return <CheckCircle2 className="h-3 w-3" />;
    case "pending":
      return <AlertCircle className="h-3 w-3" />;
    case "resolved":
      return <RefreshCw className="h-3 w-3" />;
    case "closed":
      return <XCircle className="h-3 w-3" />;
  }
}

function formatRelativeTime(ts?: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Şimdi";
    if (diffMins < 60) return `${diffMins}dk`;
    if (diffHours < 24) return `${diffHours}sa`;
    if (diffDays === 1) return "Dün";
    if (diffDays < 7) return `${diffDays}g`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
