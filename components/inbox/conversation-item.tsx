"use client";

import React from "react";
import { ConversationSummaryDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { User, Clock, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";

interface ConversationItemProps {
  conversation: ConversationSummaryDTO;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const providerLabel: Record<ConversationSummaryDTO["provider"], string> = {
  whatsapp: "WA",
  instagram: "IG",
  facebook: "FB",
  google: "G",
  tiktok: "TT",
};

export function ConversationItem({ conversation, isSelected, onSelect }: ConversationItemProps) {
  const { id, contactName, contactMaskedPhone, lastMessageSnippet, lastMessageAt, unreadCount, status, assignedUserName, provider } = conversation;
  return (
    <div onClick={() => onSelect(id)} className={`group relative flex cursor-pointer items-start space-x-3 rounded-xl p-3.5 transition-all duration-150 ${isSelected ? "bg-emerald-950/40 border border-emerald-500/30 shadow-md shadow-emerald-950/20" : "bg-slate-900/60 border border-slate-800/60 hover:bg-slate-800/50 hover:border-slate-700/60"}`}>
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm">{contactName.slice(0, 2).toUpperCase()}</div>
        <div className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-slate-950 shadow-sm" title={`${provider} channel`}>
          {providerLabel[provider]}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between space-x-2">
          <h4 className="text-xs font-semibold text-slate-100 truncate group-hover:text-emerald-400 transition-colors">{contactName}</h4>
          <span className="text-[10px] text-slate-400 shrink-0 flex items-center"><Clock className="h-3 w-3 mr-0.5 opacity-60" />{formatRelativeTime(lastMessageAt)}</span>
        </div>
        <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">{contactMaskedPhone || provider.toUpperCase()}</p>
        <p className="text-xs text-slate-300 truncate mt-1 line-clamp-1">{lastMessageSnippet || <span className="italic text-slate-500">No message snippet</span>}</p>
        <div className="mt-2.5 flex items-center justify-between text-[10px]">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium border ${getStatusBadgeStyle(status)}`}>{getStatusIcon(status)}<span className="ml-1 capitalize">{status}</span></span>
          <div className="flex items-center space-x-2">
            {assignedUserName && <span className="text-slate-400 truncate max-w-[90px] flex items-center"><User className="h-3 w-3 mr-0.5 opacity-60 shrink-0" /><span className="truncate">{assignedUserName}</span></span>}
            {unreadCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 font-bold text-[10px] text-slate-950 shadow-sm">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusBadgeStyle(status: ConversationSummaryDTO["status"]) {
  switch (status) {
    case "open": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "pending": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "resolved": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "closed": return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    default: return "bg-slate-800 text-slate-400 border-slate-700";
  }
}
function getStatusIcon(status: ConversationSummaryDTO["status"]) {
  switch (status) {
    case "open": return <CheckCircle2 className="h-3 w-3" />;
    case "pending": return <AlertCircle className="h-3 w-3" />;
    case "resolved": return <RefreshCw className="h-3 w-3" />;
    case "closed": return <XCircle className="h-3 w-3" />;
  }
}
function formatRelativeTime(ts?: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts); const diffMins = Math.floor((Date.now() - d.getTime()) / 60000); const diffHours = Math.floor(diffMins / 60); const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return "Just now"; if (diffMins < 60) return `${diffMins}m`; if (diffHours < 24) return `${diffHours}h`; if (diffDays === 1) return "Yesterday"; if (diffDays < 7) return `${diffDays}d`; return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return ""; }
}
