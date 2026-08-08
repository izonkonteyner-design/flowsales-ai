import type { NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { authenticateApiRequest } from "@/server/services/api-auth";

const createLeadSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  company: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  source: z.string().trim().min(1).max(80).default("API"),
  estimated_value: z.number().nonnegative().default(0),
  currency: z.string().trim().length(3).default("TRY"),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request, "crm:read");
  if (!auth.ok) return auth.response;

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "50");
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 50));
  const status = request.nextUrl.searchParams.get("status")?.trim();
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("leads")
    .select("id,full_name,company,email,phone,city,source,status,estimated_value,currency,next_follow_up_at,created_at,updated_at")
    .eq("organization_id", auth.principal.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });
  return Response.json({ data: data ?? [], meta: { limit } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request, "crm:write");
  if (!auth.ok) return auth.response;

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return Response.json({ error: "idempotency_key_required" }, { status: 400 });
  }

  const parsed = createLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation_failed", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const requestKey = `api:${auth.principal.keyId}:lead:${idempotencyKey}`;
  const { data: existing } = await admin
    .from("app_audit_logs")
    .select("entity_id")
    .eq("organization_id", auth.principal.organizationId)
    .eq("action", "api.lead.created")
    .contains("metadata", { idempotency_key: requestKey })
    .maybeSingle();
  if (existing?.entity_id) {
    const { data } = await admin.from("leads").select("*").eq("organization_id", auth.principal.organizationId).eq("id", existing.entity_id).maybeSingle();
    return Response.json({ data, meta: { idempotent_replay: true } }, { status: 200 });
  }

  const { data, error } = await admin.from("leads").insert({
    organization_id: auth.principal.organizationId,
    ...parsed.data,
    status: "new",
    created_by: null,
  }).select("id,full_name,company,email,phone,city,source,status,estimated_value,currency,created_at,updated_at").single();
  if (error || !data) return Response.json({ error: "create_failed" }, { status: 500 });

  await admin.from("app_audit_logs").insert({
    organization_id: auth.principal.organizationId,
    actor_id: null,
    action: "api.lead.created",
    entity_type: "lead",
    entity_id: data.id,
    metadata: { api_key_id: auth.principal.keyId, idempotency_key: requestKey },
  });
  return Response.json({ data }, { status: 201 });
}
