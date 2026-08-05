"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConversationSummaryDTO, ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationView } from "@/components/inbox/conversation-view";
import { fetchInboxDataAction, fetchConversationDetailAction } from "@/app/(app)/inbox/actions";

interface InboxShellProps {
  initialConversationId?: string;
}

export function InboxShell({ initialConversationId }: InboxShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [, startTransition] = useTransition();

  // Load conversation list on filter changes
  useEffect(() => {
    let isMounted = true;
    setIsListLoading(true);

    fetchInboxDataAction({
      statusFilter,
      providerFilter,
      assigneeFilter,
      searchQuery,
    })
      .then((res) => {
        if (!isMounted) return;
        setConversations(res.conversations);
        setUserRole(res.userRole);
        setIsDemo(res.isDemo);
        setIsListLoading(false);

        // Auto select first conversation if none selected and not on mobile
        if (!selectedId && res.conversations.length > 0) {
          setSelectedId(res.conversations[0].id);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load inbox conversations:", err);
        setIsListLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [statusFilter, providerFilter, assigneeFilter, searchQuery]);

  // Load selected conversation detail
  useEffect(() => {
    if (!selectedId) {
      setActiveConversation(null);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    fetchConversationDetailAction(selectedId)
      .then((res) => {
        if (!isMounted) return;
        setActiveConversation(res.conversation);
        setOrganizationMembers(res.organizationMembers);
        setIsDetailLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load conversation detail:", err);
        setActiveConversation(null);
        setIsDetailLoading(false);
      });

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
      {/* Left Sidebar (Conversation List & Filters) */}
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

      {/* Right Main Pane (Conversation Detail & Message Timeline) */}
      <div className="flex-1">
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
  );
}
