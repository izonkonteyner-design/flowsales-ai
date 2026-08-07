import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";
import { DEMO_ORGANIZATION_ID } from "@/server/repositories/supabase/omnichannel-inbox";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.organization.id === DEMO_ORGANIZATION_ID) {
    return NextResponse.json({ conversations: [], hasMore: false, page: 0, userRole: ctx.role, isDemo: true });
  }
  const url = new URL(request.url);
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0);
  const status = url.searchParams.get("status") || "all";
  const provider = url.searchParams.get("provider") || "all";
  const assignee = url.searchParams.get("assignee") || "all";
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("conversations").select(`
    id,organization_id,connection_id,provider,external_id,status,unread_count,last_message_at,assigned_user_id,created_at,updated_at,
    channel_contacts(display_name,phone_number,avatar_url)
  `).eq("organization_id", ctx.organization.id);
  if (ctx.role === "sales") query = query.or(`assigned_user_id.eq.${ctx.userId},assigned_user_id.is.null`);
  if (status === "unread") query = query.gt("unread_count", 0);
  else if (["open","pending","resolved","closed"].includes(status)) query = query.eq("status", status);
  if (provider !== "all") query = query.eq("provider", provider);
  if (assignee === "me") query = query.eq("assigned_user_id", ctx.userId);
  else if (assignee === "unassigned") query = query.is("assigned_user_id", null);
  else if (assignee !== "all") query = query.eq("assigned_user_id", assignee);
  const from = page * PAGE_SIZE;
  const { data, error } = await query.order("last_message_at", { ascending: false, nullsFirst: false }).range(from, from + PAGE_SIZE);
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const rows = data || [];
  const pageRows = rows.slice(0, PAGE_SIZE);
  const ids = pageRows.map((row) => row.id);
  const { data: messages } = ids.length ? await supabase.from("messages").select("conversation_id,body,sent_at,created_at").in("conversation_id", ids).order("sent_at", { ascending: false }) : { data: [] };
  const snippets = new Map<string,string>();
  for (const message of messages || []) if (!snippets.has(message.conversation_id)) snippets.set(message.conversation_id, message.body || "[Media Attachment]");
  const assignedIds = [...new Set(pageRows.map((row) => row.assigned_user_id).filter(Boolean))] as string[];
  const { data: members } = assignedIds.length ? await supabase.from("organization_members").select("user_id,name,email").eq("organization_id", ctx.organization.id).in("user_id", assignedIds) : { data: [] };
  const names = new Map((members || []).map((m) => [m.user_id, m.name || m.email || "Assigned Agent"]));
  let conversations = pageRows.map((row) => {
    const contact = Array.isArray(row.channel_contacts) ? row.channel_contacts[0] : row.channel_contacts;
    const rawPhone = contact?.phone_number || row.external_id || "";
    return {
      id: row.id, organizationId: row.organization_id, connectionId: row.connection_id, provider: row.provider,
      externalId: row.external_id, status: row.status || "open", unreadCount: row.unread_count || 0,
      lastMessageAt: row.last_message_at, assignedUserId: row.assigned_user_id,
      assignedUserName: row.assigned_user_id ? names.get(row.assigned_user_id) || "Assigned Agent" : null,
      contactName: contact?.display_name || maskPhoneNumber(rawPhone) || "WhatsApp Contact",
      contactMaskedPhone: maskPhoneNumber(rawPhone), contactAvatarUrl: contact?.avatar_url || null,
      lastMessageSnippet: snippets.get(row.id) || null, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  });
  if (search) conversations = conversations.filter((row) => row.contactName.toLowerCase().includes(search) || row.id.toLowerCase().includes(search) || row.lastMessageSnippet?.toLowerCase().includes(search));
  return NextResponse.json({ conversations, hasMore: rows.length > PAGE_SIZE, page, userRole: ctx.role, isDemo: false });
}
