import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";

export const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export interface ConversationSummaryDTO {
  id: string;
  organizationId: string;
  connectionId: string;
  provider: "whatsapp" | "instagram" | "facebook" | "google" | "tiktok";
  externalId: string;
  status: "open" | "pending" | "resolved" | "closed";
  unreadCount: number;
  lastMessageAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  contactName: string;
  contactMaskedPhone: string;
  contactAvatarUrl: string | null;
  lastMessageSnippet: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItemDTO {
  id: string;
  organizationId: string;
  conversationId: string;
  provider: string;
  externalId: string | null;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  senderName: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  metadata: Record<string, unknown>;
  attachments: Array<{
    id: string;
    attachmentType: string;
    fileName: string | null;
    mimeType: string | null;
    externalUrl: string | null;
  }>;
  sentAt: string;
  createdAt: string;
}

export interface ConversationDetailDTO extends ConversationSummaryDTO {
  connectionStatus: string;
  messages: MessageItemDTO[];
}

export { maskPhoneNumber };

export class OmnichannelInboxRepository {
  async getConversations(params: {
    organizationId: string;
    userId: string;
    userRole: string;
    statusFilter?: string;
    providerFilter?: string;
    assigneeFilter?: string;
    searchQuery?: string;
  }): Promise<ConversationSummaryDTO[]> {
    const { organizationId, userId, userRole, statusFilter, providerFilter, assigneeFilter, searchQuery } = params;

    // Demo organization exclusion safeguard: Demo accounts see 0 live production records
    if (organizationId === DEMO_ORGANIZATION_ID) {
      return [];
    }

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("conversations")
      .select(`
        id,
        organization_id,
        connection_id,
        provider,
        external_id,
        status,
        unread_count,
        last_message_at,
        assigned_user_id,
        created_at,
        updated_at,
        channel_contacts (
          display_name,
          phone_number,
          avatar_url
        ),
        channel_connections (
          status
        )
      `)
      .eq("organization_id", organizationId);

    // Sales role isolation: only see assigned or unassigned
    if (userRole === "sales") {
      query = query.or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`);
    }

    // Status filter
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "unread") {
        query = query.gt("unread_count", 0);
      } else if (["open", "pending", "resolved", "closed"].includes(statusFilter)) {
        query = query.eq("status", statusFilter);
      }
    }

    // Provider filter
    if (providerFilter && providerFilter !== "all") {
      query = query.eq("provider", providerFilter);
    }

    // Assignee filter
    if (assigneeFilter && assigneeFilter !== "all") {
      if (assigneeFilter === "me") {
        query = query.eq("assigned_user_id", userId);
      } else if (assigneeFilter === "unassigned") {
        query = query.is("assigned_user_id", null);
      } else {
        query = query.eq("assigned_user_id", assigneeFilter);
      }
    }

    query = query.order("last_message_at", { ascending: false, nullsFirst: false });

    const { data: convs, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    if (!convs || convs.length === 0) {
      return [];
    }

    const convIds = convs.map((c) => c.id);

    // Fetch latest message for each conversation
    const { data: latestMessages } = await supabase
      .from("messages")
      .select("conversation_id, body, sent_at, created_at")
      .in("conversation_id", convIds)
      .order("sent_at", { ascending: false });

    const latestMsgMap = new Map<string, string>();
    if (latestMessages) {
      for (const m of latestMessages) {
        if (!latestMsgMap.has(m.conversation_id)) {
          latestMsgMap.set(m.conversation_id, m.body || "[Media Attachment]");
        }
      }
    }

    // Fetch member names for assigned_user_id
    const assignedUserIds = Array.from(new Set(convs.map((c) => c.assigned_user_id).filter(Boolean))) as string[];
    const userNameMap = new Map<string, string>();

    if (assignedUserIds.length > 0) {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, name, email")
        .in("user_id", assignedUserIds);

      if (members) {
        for (const mb of members) {
          userNameMap.set(mb.user_id, mb.name || mb.email || "Member");
        }
      }
    }

    let summaries: ConversationSummaryDTO[] = convs.map((c) => {
      const contact = Array.isArray(c.channel_contacts) ? c.channel_contacts[0] : c.channel_contacts;
      const snippet = latestMsgMap.get(c.id) || null;
      const rawPhone = contact?.phone_number || c.external_id || "";

      return {
        id: c.id,
        organizationId: c.organization_id,
        connectionId: c.connection_id,
        provider: c.provider as ConversationSummaryDTO["provider"],
        externalId: c.external_id,
        status: (c.status as ConversationSummaryDTO["status"]) || "open",
        unreadCount: c.unread_count || 0,
        lastMessageAt: c.last_message_at,
        assignedUserId: c.assigned_user_id,
        assignedUserName: c.assigned_user_id ? userNameMap.get(c.assigned_user_id) || "Assigned Agent" : null,
        contactName: contact?.display_name || maskPhoneNumber(rawPhone) || "WhatsApp Contact",
        contactMaskedPhone: maskPhoneNumber(rawPhone),
        contactAvatarUrl: contact?.avatar_url || null,
        lastMessageSnippet: snippet,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    // Search query filter (filtering contact name, snippet, or conversation ID)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      summaries = summaries.filter(
        (s) =>
          s.contactName.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.lastMessageSnippet && s.lastMessageSnippet.toLowerCase().includes(q))
      );
    }

    return summaries;
  }

  async getConversationDetail(params: {
    organizationId: string;
    userId: string;
    userRole: string;
    conversationId: string;
  }): Promise<ConversationDetailDTO | null> {
    const { organizationId, userId, userRole, conversationId } = params;

    if (organizationId === DEMO_ORGANIZATION_ID) {
      return null;
    }

    const supabase = createSupabaseAdminClient();

    const { data: conv, error } = await supabase
      .from("conversations")
      .select(`
        id,
        organization_id,
        connection_id,
        provider,
        external_id,
        status,
        unread_count,
        last_message_at,
        assigned_user_id,
        created_at,
        updated_at,
        channel_contacts (
          display_name,
          phone_number,
          avatar_url
        ),
        channel_connections (
          status
        )
      `)
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !conv) {
      return null;
    }

    if (userRole === "sales" && conv.assigned_user_id && conv.assigned_user_id !== userId) {
      return null;
    }

    const contact = Array.isArray(conv.channel_contacts) ? conv.channel_contacts[0] : conv.channel_contacts;
    const connection = Array.isArray(conv.channel_connections) ? conv.channel_connections[0] : conv.channel_connections;
    const rawPhone = contact?.phone_number || conv.external_id || "";

    const { data: rawMsgs } = await supabase
      .from("messages")
      .select(`
        id,
        organization_id,
        conversation_id,
        provider,
        external_id,
        direction,
        message_type,
        body,
        status,
        metadata,
        sent_at,
        created_at,
        message_attachments (
          id,
          attachment_type,
          file_name,
          mime_type,
          external_url
        )
      `)
      .eq("conversation_id", conversationId)
      .eq("organization_id", organizationId)
      .order("sent_at", { ascending: true })
      .order("created_at", { ascending: true });

    const messages: MessageItemDTO[] = (rawMsgs || []).map((m) => {
      const atts = Array.isArray(m.message_attachments) ? m.message_attachments : [];
      return {
        id: m.id,
        organizationId: m.organization_id,
        conversationId: m.conversation_id,
        provider: m.provider,
        externalId: m.external_id,
        direction: (m.direction as MessageItemDTO["direction"]) || "inbound",
        messageType: m.message_type || "text",
        body: m.body,
        senderName: m.direction === "inbound" ? contact?.display_name || maskPhoneNumber(rawPhone) : "Support Agent",
        status: (m.status as MessageItemDTO["status"]) || "delivered",
        metadata: (m.metadata as Record<string, unknown>) || {},
        attachments: atts.map((a) => ({
          id: a.id,
          attachmentType: a.attachment_type || "document",
          fileName: a.file_name,
          mimeType: a.mime_type,
          externalUrl: a.external_url,
        })),
        sentAt: m.sent_at,
        createdAt: m.created_at,
      };
    });

    let assignedUserName: string | null = null;
    if (conv.assigned_user_id) {
      const { data: member } = await supabase
        .from("organization_members")
        .select("name, email")
        .eq("user_id", conv.assigned_user_id)
        .maybeSingle();

      if (member) {
        assignedUserName = member.name || member.email || "Assigned Agent";
      }
    }

    const lastMsgSnippet = messages.length > 0 ? messages[messages.length - 1].body : null;

    return {
      id: conv.id,
      organizationId: conv.organization_id,
      connectionId: conv.connection_id,
      provider: conv.provider as ConversationSummaryDTO["provider"],
      externalId: conv.external_id,
      status: (conv.status as ConversationSummaryDTO["status"]) || "open",
      unreadCount: conv.unread_count || 0,
      lastMessageAt: conv.last_message_at,
      assignedUserId: conv.assigned_user_id,
      assignedUserName,
      contactName: contact?.display_name || maskPhoneNumber(rawPhone) || "WhatsApp Contact",
      contactMaskedPhone: maskPhoneNumber(rawPhone),
      contactAvatarUrl: contact?.avatar_url || null,
      lastMessageSnippet: lastMsgSnippet,
      connectionStatus: connection?.status || "disconnected",
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      messages,
    };
  }

  async updateStatus(params: {
    organizationId: string;
    userId: string;
    userRole: string;
    conversationId: string;
    newStatus: "open" | "pending" | "resolved" | "closed";
  }): Promise<{ success: boolean; error?: string }> {
    const { organizationId, userId, userRole, conversationId, newStatus } = params;

    if (userRole === "viewer") {
      return { success: false, error: "Viewers are read-only and cannot mutate conversation status." };
    }

    if (organizationId === DEMO_ORGANIZATION_ID) {
      return { success: false, error: "Demo organization is read-only." };
    }

    const supabase = createSupabaseAdminClient();

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, assigned_user_id")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!conv) {
      return { success: false, error: "Conversation not found." };
    }

    if (userRole === "sales" && conv.assigned_user_id && conv.assigned_user_id !== userId) {
      return { success: false, error: "Sales role can only update assigned conversations." };
    }

    const { error: updateErr } = await supabase
      .from("conversations")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  }

  async updateAssignee(params: {
    organizationId: string;
    userId: string;
    userRole: string;
    conversationId: string;
    assignedUserId: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    const { organizationId, userId, userRole, conversationId, assignedUserId } = params;

    if (userRole === "viewer") {
      return { success: false, error: "Viewers are read-only and cannot reassign conversations." };
    }

    if (organizationId === DEMO_ORGANIZATION_ID) {
      return { success: false, error: "Demo organization is read-only." };
    }

    const supabase = createSupabaseAdminClient();

    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!conv) {
      return { success: false, error: "Conversation not found." };
    }

    const { error: updateErr } = await supabase
      .from("conversations")
      .update({ assigned_user_id: assignedUserId, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  }

  async markAsRead(params: {
    organizationId: string;
    userId: string;
    userRole: string;
    conversationId: string;
  }): Promise<{ success: boolean }> {
    const { organizationId, userRole, conversationId } = params;

    if (userRole === "viewer" || organizationId === DEMO_ORGANIZATION_ID) {
      return { success: false };
    }

    const supabase = createSupabaseAdminClient();

    await supabase
      .from("conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    return { success: true };
  }
}
