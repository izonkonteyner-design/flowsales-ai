"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConversationSummaryDTO, ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationView } from "@/components/inbox/conversation-view";
import { MetaConversationView } from "@/components/inbox/meta-conversation-view";
import { CrmIdentityPanel } from "@/components/inbox/crm-identity-panel";
import { CrmConversationActions } from "@/components/inbox/crm-conversation-actions";
import { ConversationAuditPanel } from "@/components/inbox/conversation-audit-panel";
import { AiReplySuggestion } from "@/components/inbox/ai-reply-suggestion";
import { ConversationIntelligencePanel } from "@/components/inbox/conversation-intelligence-panel";
import { fetchInboxDataAction, fetchConversationDetailAction } from "@/app/(app)/inbox/actions";

interface InboxShellProps { initialConversationId?: string; }

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
  const [loadError, setLoadError] = useState("");
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function loadConversations() {
      setIsListLoading(true); setLoadError("");
      try {
        const res = await fetchInboxDataAction({ statusFilter, providerFilter, assigneeFilter, searchQuery });
        if (!isMounted) return;
        setConversations(res.conversations); setUserRole(res.userRole); setIsDemo(res.isDemo);

      } catch (err) { if (isMounted) { console.error("Failed to load inbox conversations:", err); setLoadError("Konuşmalar yüklenemedi. Bağlantıyı kontrol edip sayfayı yenileyin."); } }
      finally { if (isMounted) setIsListLoading(false); }
    }
    loadConversations(); return () => { isMounted = false; };
  }, [statusFilter, providerFilter, assigneeFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      if (!selectedId) { if (isMounted) { setActiveConversation(null); setIsDetailLoading(false); } return; }
      setIsDetailLoading(true); setLoadError("");
      try {
        const res = await fetchConversationDetailAction(selectedId);
        if (!isMounted) return;
        setActiveConversation(res.conversation); setOrganizationMembers(res.organizationMembers);
      } catch (err) { if (isMounted) { console.error("Failed to load conversation detail:", err); setLoadError("Konuşma ayrıntıları yüklenemedi. Listeye dönüp yeniden seçin."); setActiveConversation(null); } }
      finally { if (isMounted) setIsDetailLoading(false); }
    }
    loadDetail(); return () => { isMounted = false; };
  }, [selectedId]);

  const handleSelectConversation = (id: string) => { setSelectedId(id); router.push(`/inbox/${id}`, { scroll: false }); };
  const handleRefresh = () => {
    setRefreshVersion((value) => value + 1);
    if (selectedId) fetchConversationDetailAction(selectedId).then((res) => setActiveConversation(res.conversation));
    fetchInboxDataAction({ statusFilter, providerFilter, assigneeFilter, searchQuery }).then((res) => setConversations(res.conversations));
  };
  const readOnly = userRole === "viewer" || isDemo;
  const messagingProvider = Boolean(activeConversation && ["whatsapp", "instagram", "facebook"].includes(activeConversation.provider));
  const isMetaMessagingConversation = activeConversation?.provider === "instagram" || activeConversation?.provider === "facebook";

  return (
    <div>{loadError ? <p role="alert" className="mb-3 rounded-xl border border-amber-400/25 p-3 text-sm text-amber-200">{loadError}</p> : null}<div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
      <div className={`${selectedId ? "hidden md:block" : "block"} w-full md:max-w-sm shrink-0`}>
        <ConversationList conversations={conversations} selectedId={selectedId} onSelect={handleSelectConversation}
          statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
          providerFilter={providerFilter} onProviderFilterChange={setProviderFilter}
          assigneeFilter={assigneeFilter} onAssigneeFilterChange={setAssigneeFilter}
          searchQuery={searchQuery} onSearchChange={setSearchQuery} isLoading={isListLoading} isDemo={isDemo} />
      </div>

      <div className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {selectedId ? <button type="button" onClick={() => { setSelectedId(null); router.push("/inbox", { scroll: false }); }} className="border-b border-white/10 p-3 text-left text-sm text-cyan-300 md:hidden">← Konuşma listesine dön</button> : null}
        {!isDetailLoading && activeConversation && messagingProvider && (
          <>
            <CrmIdentityPanel conversationId={activeConversation.id} provider={activeConversation.provider} isReadOnly={readOnly} onChanged={handleRefresh} />
            <CrmConversationActions conversationId={activeConversation.id} disabled={readOnly} onChanged={handleRefresh} />
            <ConversationIntelligencePanel conversationId={activeConversation.id} disabled={readOnly} />
            <AiReplySuggestion conversationId={activeConversation.id} disabled={readOnly || activeConversation.connectionStatus !== "connected"} />
            <ConversationAuditPanel conversationId={activeConversation.id} refreshKey={refreshVersion} />
          </>
        )}
        <div className="min-h-0 flex-1">
          {!isDetailLoading && activeConversation && isMetaMessagingConversation ? (
            <MetaConversationView conversation={activeConversation} userRole={userRole} isDemo={isDemo}
              organizationMembers={organizationMembers} onRefresh={handleRefresh} />
          ) : (
            <ConversationView conversation={activeConversation} isLoading={isDetailLoading} userRole={userRole} isDemo={isDemo}
              organizationMembers={organizationMembers} onRefresh={handleRefresh} />
          )}
        </div>
      </div>
    </div></div>
  );
}
