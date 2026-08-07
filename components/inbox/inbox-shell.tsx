"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConversationSummaryDTO, ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CrmIdentityPanel } from "@/components/inbox/crm-identity-panel";
import { fetchInboxDataAction, fetchConversationDetailAction } from "@/app/(app)/inbox/actions";

interface InboxShellProps {
  initialConversationId?: string;
}

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

  useEffect(() => {
    let isMounted = true;

    async function loadConversations() {
      setIsListLoading(true);
      try {
        const res = await fetchInboxDataAction({
          statusFilter,
          providerFilter,
          assigneeFilter,
          searchQuery,
        });
        if (!isMounted) return;
        setConversations(res.conversations);
        setUserRole(res.userRole);
        setIsDemo(res.isDemo);

        if (!selectedId && res.conversations.length > 0) {
          setSelectedId(res.conversations[0].id);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to load inbox conversations:", err);
      } finally {
        if (isMounted) setIsListLoading(false);
      }
    }

    loadConversations();

    return () => {
      isMounted = false;
    };
  }, [statusFilter, providerFilter, assigneeFilter, searchQuery, selectedId]);

  useEffect(() => {
    let isMounted = true;

    async function loadDetail() {
      if (!selectedId) {
        if (isMounted) {
          setActiveConversation(null);
          setIsDetailLoading(false);
        }
        return;
      }

      setIsDetailLoading(true);
      try {
        const res = await fetchConversationDetailAction(selectedId);
        if (!isMounted) return;
        setActiveConversation(res.conversation);
        setOrganizationMembers(res.organizationMembers);
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to load conversation detail:", err);
        setActiveConversation(null);
      } finally {
        if (isMounted) setIsDetailLoading(false);
      }
    }

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedId]);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    router.push(`/inbox/${id}`, { scroll: false });
  };

  const handleRefresh = () => {
    if (selectedId) {
      fetchConversationDetailAction(selectedId).then((res) => {
        setActiveConversation(res.conversation);
      });
    }
    fetchInboxDataAction({ statusFilter, providerFilter, assigneeFilter, searchQuery }).then((res) => {
      setConversations(res.conversations);
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
      <div className="w-full max-w-xs md:max-w-sm shrink-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelectConversation}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          providerFilter={providerFilter}
          onProviderFilterChange={setProviderFilter}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isLoading={isListLoading}
          isDemo={isDemo}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isDetailLoading && activeConversation?.provider === "whatsapp" && (
          <CrmIdentityPanel
            conversationId={activeConversation.id}
            isReadOnly={userRole === "viewer" || isDemo}
            onChanged={handleRefresh}
          />
        )}
        <div className="min-h-0 flex-1">
          <ConversationView
            conversation={activeConversation}
            isLoading={isDetailLoading}
            userRole={userRole}
            isDemo={isDemo}
            organizationMembers={organizationMembers}
            onRefresh={handleRefresh}
          />
        </div>
      </div>
    </div>
  );
}
