/**
 * Type definitions for the omnichannel customer inbox (Faz 4A).
 *
 * Single platform-agnostic data model served by pluggable channel adapters
 * (WhatsApp, Instagram DM, Facebook Messenger, Email). These TS types are safe
 * to import from both server and client components.
 */

export type MessageChannel =
  | "whatsapp"
  | "instagram_dm"
  | "facebook_messenger"
  | "email";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus = "new" | "read" | "replied" | "closed" | "failed";

export type CustomerMessage = {
  id: string;
  organization_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  status: MessageStatus;

  channel_message_id: string;
  channel_conversation_id: string;
  idempotency_key: string;

  sender_name: string;
  sender_phone: string | null;
  sender_email: string | null;
  sender_platform_id: string | null;

  content: string;
  media_urls: string[];

  lead_id: string | null;
  lead_match_confidence: number | null;
  assigned_to: string | null;
  internal_notes: string | null;

  webhook_received_at: string;
  webhook_payload: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
};

export type CustomerMessageInput = {
  channel: MessageChannel;
  direction: MessageDirection;
  channel_message_id: string;
  channel_conversation_id: string;
  idempotency_key: string;
  sender_name: string;
  sender_phone?: string | null;
  sender_email?: string | null;
  sender_platform_id?: string | null;
  content: string;
  media_urls?: string[];
  webhook_payload?: Record<string, unknown> | null;
};

export type MessageFilterState = {
  query: string;
  channel: MessageChannel | "";
  status: MessageStatus | "";
  assignedTo: string | "";
  page: number;
  pageSize: number;
};

export type InboxStats = {
  totalMessages: number;
  newMessages: number;
  unreadCount: number;
  byChannel: Array<{ channel: MessageChannel; count: number }>;
  byStatus: Array<{ status: MessageStatus; count: number }>;
};

export type MessageThread = {
  conversationId: string;
  channel: MessageChannel;
  messages: CustomerMessage[];
  senderName: string;
  lastMessageAt: string;
  unreadCount: number;
  leadId: string | null;
};