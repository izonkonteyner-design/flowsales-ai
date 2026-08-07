"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConversationSummaryDTO, ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CrmIdentityPanel } from "@/components/inbox/crm-identity-panel";
import { AiReplySuggestion } from "@/components/inbox/ai-reply-suggestion";
import { ConversationOperationsPanel } from "@/components/inbox/conversation-operations-panel";
import { fetchConversationDetailAction } from "@/app/(app)/inbox/actions";

interface InboxShellProps { initialConversationId?: string; }

type PageResponse = { conversations: ConversationSummaryDTO[]; hasMore: boolean; page: number; userRole: string; isDemo: boolean };

export function InboxShell({ initialConversationId }: InboxShellProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId || null);
  const [conversations, setConversations] = useState<ConversationSummaryDTO[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetailDTO | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState("viewer");
  const [isDemo, setIsDemo] = useState(false);
  const [organizationMembers, setOrganizationMembers] = useState<Array<{ userId: string; name: string; email: string }>>([]);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  async function loadConversationPage(targetPage: number, append = false) {
    setIsListLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(targetPage), status: statusFilter, provider: providerFilter, assignee: assigneeFilter, search: searchQuery });
      const response = await fetch(`/api/inbox/conversations?${qs.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load paginated Inbox.");
      const data = await response.json() as PageResponse;
      setConversations((current) => append ? [...current, ...data.conversations.filter((item) => !current.some((existing) => existing.id === item.id))] : data.conversations);
      setPage(data.page); setHasMore(data.hasMore); setUserRole(data.userRole); setIsDemo(data.isDemo);
      if (!append && !selectedId && data.conversations.length > 0) setSelectedId(data.conversations[0].id);
    } catch (error) { console.error("Failed to load inbox conversations:", error); }
    finally { setIsListLoading(false); }
  }

  useEffect(() => { void loadConversationPage(0, false); }, [statusFilter, providerFilter, assigneeFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      if (!selectedId) { if (isMounted) { setActiveConversation(null); setIsDetailLoading(false); } return; }
      setIsDetailLoading(true);
      try {
        const res = await fetchConversationDetailAction(selectedId);
        if (!isMounted) return;
        setActiveConversation(res.conversation); setOrganizationMembers(res.organizationMembers);
      } catch (error) { if (isMounted) { console.error("Failed to load conversation detail:", error); setActiveConversation(null); } }
      finally { if (isMounted) setIsDetailLoading(false); }
    }
    void loadDetail();
    return () => { isMounted = false; };
  }, [selectedId]);

  const handleSelectConversation = (id: string) => { setSelectedId(id); router.push(`/inbox/${id}`, { scroll: false }); };
  const handleRefresh = () => {
    if (selectedId) void fetchConversationDetailAction(selectedId).then((res) => setActiveConversation(res.conversation));
    void loadConversationPage(0, false);
  };
  const readOnly = userRole === "viewer" || isDemo;

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
      <div className="flex w-full max-w-xs shrink-0 flex-col md:max-w-sm">
        <div className="min-h-0 flex-1">
          <ConversationList conversations={conversations} selectedId={selectedId} onSelect={handleSelectConversation}
            statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} providerFilter={providerFilter}
            onProviderFilterChange={setProviderFilter} assigneeFilter={assigneeFilter} onAssigneeFilterChange={setAssigneeFilter}
            searchQuery={searchQuery} onSearchChange={setSearchQuery} isLoading={isListLoading && page === 0} isDemo={isDemo} />
        </div>
        {hasMore && <button disabled={isListLoading} onClick={() => void loadConversationPage(page + 1, true)} className="border-t border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-slate-800 disabled:opacity-50">{isListLoading ? "Loading…" : "Load 50 more conversations"}</button>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {!isDetailLoading && activeConversation?.provider === "whatsapp" && (
          <>
            <CrmIdentityPanel conversationId={activeConversation.id} isReadOnly={readOnly} onChanged={handleRefresh} />
            <AiReplySuggestion conversationId={activeConversation.id} disabled={readOnly || activeConversation.connectionStatus !== "connected"} />
            <ConversationOperationsPanel conversation={activeConversation} disabled={readOnly} onRefresh={handleRefresh} />
          </>
        )}
        <div className="min-h-0 flex-1">
          <ConversationView conversation={activeConversation} isLoading={isDetailLoading} userRole={userRole} isDemo={isDemo}
            organizationMembers={organizationMembers} onRefresh={handleRefresh} />
        </div>
      </div>
    </div>
  );
}
