"use client";

import React from "react";
import { ConversationSummaryDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { ConversationItem } from "@/components/inbox/conversation-item";
import { Search, Filter, MessageSquare, Inbox, ShieldAlert } from "lucide-react";

interface ConversationListProps {
  conversations: ConversationSummaryDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  providerFilter: string;
  onProviderFilterChange: (provider: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (assignee: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
  isDemo: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  providerFilter,
  onProviderFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  searchQuery,
  onSearchChange,
  isLoading,
  isDemo,
}: ConversationListProps) {
  const statusTabs = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "open", label: "Open" },
    { key: "pending", label: "Pending" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
  ];

  return (
    <div className="flex h-full flex-col bg-slate-950/80 border-r border-slate-800/80">
      {/* Search & Header */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Inbox className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Omnichannel Inbox
            </h2>
          </div>
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
            {conversations.length} {conversations.length === 1 ? "thread" : "threads"}
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search contact, snippet, ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Channel & Assignee Filters */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <select
            value={providerFilter}
            onChange={(e) => onProviderFilterChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => onAssigneeFilterChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Assignees</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar pt-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onStatusFilterChange(tab.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation List / States */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isDemo ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <ShieldAlert className="h-8 w-8 text-amber-400 mb-2" />
            <p className="text-xs font-semibold text-slate-300">Demo Production Exclusion</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Demo accounts cannot access live production conversations.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-slate-900/40 border border-slate-800/40 animate-pulse"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <MessageSquare className="h-8 w-8 text-slate-400 mb-2" />
            <p className="text-xs font-medium text-slate-300">No conversations found</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {searchQuery ? "Try clearing search filter" : "Incoming WhatsApp messages will populate this list."}
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
