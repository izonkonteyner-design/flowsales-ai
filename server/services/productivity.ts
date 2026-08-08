import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

async function liveContext() {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") return { workspace, client: null };
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Supabase is not configured.");
  return { workspace, client };
}

export async function listWorkspaceTasks() {
  const { workspace, client } = await liveContext();
  if (!client) return [];
  const { data, error } = await client
    .from("tasks")
    .select("id,title,due_at,priority,status,assigned_to,lead_id,created_at")
    .eq("organization_id", workspace.organization.id)
    .order("status", { ascending: false })
    .order("due_at", { ascending: true })
    .limit(250);
  if (error) throw new Error("Görevler yüklenemedi.");
  return data ?? [];
}

export async function createWorkspaceTask(input: { title: string; dueAt: string; priority: "low" | "medium" | "high"; leadId?: string | null; assignedTo?: string | null }) {
  const { workspace, client } = await liveContext();
  if (!client || workspace.mode === "demo") throw new Error("Demo çalışma alanında görev oluşturulamaz.");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Oturum gerekli.");
  const { error } = await client.from("tasks").insert({
    organization_id: workspace.organization.id,
    title: input.title.trim(),
    due_at: input.dueAt,
    priority: input.priority,
    lead_id: input.leadId || null,
    assigned_to: input.assignedTo || auth.user.id,
    status: "open",
    created_by: auth.user.id,
  });
  if (error) throw new Error("Görev oluşturulamadı.");
  await writeAudit("task.created", "task", null, { title: input.title });
}

export async function updateWorkspaceTaskStatus(taskId: string, status: "open" | "completed") {
  const { workspace, client } = await liveContext();
  if (!client || workspace.mode === "demo") throw new Error("Demo çalışma alanı salt okunurdur.");
  const { error } = await client.from("tasks").update({ status }).eq("organization_id", workspace.organization.id).eq("id", taskId);
  if (error) throw new Error("Görev güncellenemedi.");
  await writeAudit("task.status_changed", "task", taskId, { status });
}

export async function listCalendarEvents() {
  const { workspace, client } = await liveContext();
  if (!client) return [];
  const { data, error } = await client
    .from("calendar_events")
    .select("id,title,description,starts_at,ends_at,event_type,lead_id,assigned_to,location")
    .eq("organization_id", workspace.organization.id)
    .gte("ends_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(250);
  if (error) throw new Error("Takvim etkinlikleri yüklenemedi.");
  return data ?? [];
}

export async function createCalendarEvent(input: { title: string; startsAt: string; endsAt: string; eventType: string; location?: string | null; leadId?: string | null }) {
  const { workspace, client } = await liveContext();
  if (!client || workspace.mode === "demo") throw new Error("Demo çalışma alanında etkinlik oluşturulamaz.");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Oturum gerekli.");
  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new Error("Bitiş zamanı başlangıçtan sonra olmalıdır.");
  const { error } = await client.from("calendar_events").insert({
    organization_id: workspace.organization.id,
    title: input.title.trim(),
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    event_type: input.eventType,
    location: input.location || null,
    lead_id: input.leadId || null,
    assigned_to: auth.user.id,
    created_by: auth.user.id,
  });
  if (error) throw new Error("Takvim etkinliği oluşturulamadı.");
  await writeAudit("calendar.created", "calendar_event", null, { title: input.title });
}

export async function listAuditLogs(filters?: { action?: string; entity?: string }) {
  const { workspace, client } = await liveContext();
  if (!client) return [];
  let query = client
    .from("app_audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (filters?.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters?.entity) query = query.eq("entity_type", filters.entity);
  const { data, error } = await query;
  if (error) throw new Error("Denetim kayıtları yüklenemedi.");
  return data ?? [];
}

export async function listApiKeys() {
  const { workspace, client } = await liveContext();
  if (!client) return [];
  const { data, error } = await client
    .from("api_keys")
    .select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("API anahtarları yüklenemedi.");
  return data ?? [];
}

export async function createApiKey(name: string, scopes: string[]) {
  const { workspace, client } = await liveContext();
  if (!client || workspace.mode === "demo") throw new Error("Demo çalışma alanında API anahtarı oluşturulamaz.");
  if (workspace.role !== "owner" && workspace.role !== "admin") throw new Error("Bu işlem için yönetici yetkisi gerekir.");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Oturum gerekli.");
  const raw = `fsa_${randomBytes(30).toString("base64url")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  const { error } = await client.from("api_keys").insert({
    organization_id: workspace.organization.id,
    name: name.trim(),
    key_prefix: prefix,
    key_hash: hash,
    scopes,
    created_by: auth.user.id,
  });
  if (error) throw new Error("API anahtarı oluşturulamadı.");
  await writeAudit("api_key.created", "api_key", null, { name, prefix, scopes });
  return raw;
}

export async function revokeApiKey(id: string) {
  const { workspace, client } = await liveContext();
  if (!client || workspace.mode === "demo") throw new Error("Demo çalışma alanı salt okunurdur.");
  if (workspace.role !== "owner" && workspace.role !== "admin") throw new Error("Bu işlem için yönetici yetkisi gerekir.");
  const { error } = await client.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("organization_id", workspace.organization.id).eq("id", id);
  if (error) throw new Error("API anahtarı iptal edilemedi.");
  await writeAudit("api_key.revoked", "api_key", id, {});
}

export async function writeAudit(action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") return;
  const client = await createSupabaseServerClient();
  if (!client) return;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const admin = createSupabaseAdminClient();
  await admin.from("app_audit_logs").insert({
    organization_id: workspace.organization.id,
    actor_id: auth.user.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}
