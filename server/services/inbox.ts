"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type CustomerMessage,
  type CustomerMessageInput,
  type MessageChannel,
  type MessageDirection,
  type MessageFilterState,
  type MessageStatus,
  type InboxStats,
} from "@/types/inbox";
import { demoOrganization } from "@/server/services/crm-data";

type Fail = { ok: false; error: string };
type SupabaseLike = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function fail(message: string): Fail {
  return { ok: false, error: message };
}

type CustomerMessageRow = {
  id: string;
  organization_id: string;
  channel: string;
  direction: string;
  status: string;
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

function mapRow(row: CustomerMessageRow): CustomerMessage {
  return {
    id: row.id,
    organization_id: row.organization_id,
    channel: row.channel as MessageChannel,
    direction: row.direction as MessageDirection,
    status: row.status as MessageStatus,
    channel_message_id: row.channel_message_id,
    channel_conversation_id: row.channel_conversation_id,
    idempotency_key: row.idempotency_key,
    sender_name: row.sender_name,
    sender_phone: row.sender_phone,
    sender_email: row.sender_email,
    sender_platform_id: row.sender_platform_id,
    content: row.content,
    media_urls: row.media_urls ?? [],
    lead_id: row.lead_id,
    lead_match_confidence: row.lead_match_confidence ?? null,
    assigned_to: row.assigned_to,
    internal_notes: row.internal_notes,
    webhook_received_at: row.webhook_received_at,
    webhook_payload: row.webhook_payload,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function receiveMessage(
  input: CustomerMessageInput,
  client?: SupabaseLike,
): Promise<{ ok: true; message: CustomerMessage; duplicate: boolean } | Fail> {
  const supabase = client ?? (await createSupabaseServerClient());
  if (!supabase) {
    return fail("Supabase not configured.");
  }

  const organizationId = demoOrganization.id;

  const { data: existing } = await supabase
    .from("customer_messages")
    .select("*")
    .eq("idempotency_key", input.idempotency_key)
    .maybeSingle();

  if (existing) {
    return { ok: true, message: mapRow(existing as CustomerMessageRow), duplicate: true };
  }

  const { data, error } = await supabase
    .from("customer_messages")
    .insert({
      organization_id: organizationId,
      channel: input.channel,
      direction: input.direction,
      status: "new",
      channel_message_id: input.channel_message_id,
      channel_conversation_id: input.channel_conversation_id,
      idempotency_key: input.idempotency_key,
      sender_name: input.sender_name,
      sender_phone: input.sender_phone ?? null,
      sender_email: input.sender_email ?? null,
      sender_platform_id: input.sender_platform_id ?? null,
      content: input.content,
      media_urls: input.media_urls ?? [],
      lead_id: null,
      lead_match_confidence: null,
      assigned_to: null,
      internal_notes: null,
      webhook_received_at: new Date().toISOString(),
      webhook_payload: input.webhook_payload ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return fail("Failed to receive message: " + (error?.message ?? "unknown error"));
  }

  return { ok: true, message: mapRow(data as CustomerMessageRow), duplicate: false };
}

export async function listMessages(
  filter: Partial<MessageFilterState>,
  client?: SupabaseLike,
): Promise<{ ok: true; data: CustomerMessage[]; total: number } | Fail> {
  const supabase = client ?? (await createSupabaseServerClient());
  if (!supabase) {
    return fail("Supabase not configured.");
  }

  const organizationId = demoOrganization.id;
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("customer_messages")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (filter.channel) {
    query = query.eq("channel", filter.channel);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.query) {
    query = query.ilike("content", "%" + filter.query + "%");
  }
  if (filter.assignedTo) {
    query = query.eq("assigned_to", filter.assignedTo);
  }

  const { data, error, count } = await query.range(offset, offset + pageSize - 1);

  if (error) {
    return fail("Failed to list messages: " + error.message);
  }

  return {
    ok: true,
    data: (data ?? []).map((row: CustomerMessageRow) => mapRow(row)),
    total: count ?? 0,
  };
}

export async function updateMessage(
  messageId: string,
  updates: Partial<{
    status: MessageStatus;
    assigned_to: string | null;
    internal_notes: string | null;
    lead_id: string | null;
    lead_match_confidence: number | null;
  }>,
  client?: SupabaseLike,
): Promise<{ ok: true; message: CustomerMessage } | Fail> {
  const supabase = client ?? (await createSupabaseServerClient());
  if (!supabase) {
    return fail("Supabase not configured.");
  }

  const organizationId = demoOrganization.id;

  const updateData: Record<string, unknown> = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.assigned_to !== undefined) updateData.assigned_to = updates.assigned_to;
  if (updates.internal_notes !== undefined) updateData.internal_notes = updates.internal_notes;
  if (updates.lead_id !== undefined) updateData.lead_id = updates.lead_id;
  if (updates.lead_match_confidence !== undefined) {
    updateData.lead_match_confidence = updates.lead_match_confidence;
  }
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("customer_messages")
    .update(updateData)
    .eq("id", messageId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    return fail("Failed to update message: " + (error?.message ?? "message not found"));
  }

  return { ok: true, message: mapRow(data as CustomerMessageRow) };
}

export async function getInboxStats(client?: SupabaseLike): Promise<{ ok: true; stats: InboxStats } | Fail> {
  const supabase = client ?? (await createSupabaseServerClient());
  if (!supabase) {
    return fail("Supabase not configured.");
  }

  const organizationId = demoOrganization.id;

  const { data, error } = await supabase
    .from("customer_messages")
    .select("channel, status")
    .eq("organization_id", organizationId);

  if (error) {
    return fail("Failed to get inbox stats: " + error.message);
  }

  const rows = (data ?? []) as { channel: string; status: string }[];
  const totalMessages = rows.length;
  const newMessages = rows.filter((r) => r.status === "new").length;
  const unreadCount = rows.filter((r) => r.status === "new" || r.status === "read").length;

  const byChannel = new Map<MessageChannel, number>();
  const byStatus = new Map<MessageStatus, number>();

  for (const row of rows) {
    byChannel.set(row.channel as MessageChannel, (byChannel.get(row.channel as MessageChannel) ?? 0) + 1);
    byStatus.set(row.status as MessageStatus, (byStatus.get(row.status as MessageStatus) ?? 0) + 1);
  }

  return {
    ok: true,
    stats: {
      totalMessages,
      newMessages,
      unreadCount,
      byChannel: [...byChannel.entries()].map(([channel, count]) => ({ channel, count })),
      byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    },
  };
}

export async function linkMessageToLead(
  messageId: string,
  leadId: string,
  confidence: number | null,
  client?: SupabaseLike,
): Promise<{ ok: true; message: CustomerMessage } | Fail> {
  return updateMessage(messageId, {
    lead_id: leadId,
    lead_match_confidence: confidence,
  }, client);
}
