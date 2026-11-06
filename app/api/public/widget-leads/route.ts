import type { NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const widgetLeadSchema = z.object({
  widgetKey: z.string().trim().min(10).max(200),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  message: z.string().trim().max(2000).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  website: z.string().trim().max(0).nullable().optional(),
});

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  try {
    const rate = await checkRateLimit(ip, "widget_lead_submit", 10, 60 * 60_000);
    if (!rate.allowed) return json({ error: "rate_limit_exceeded" }, 429);
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) return json({ error: "rate_limit_unavailable" }, 503);
    throw error;
  }

  const parsed = widgetLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "validation_failed" }, 400);
  const input = parsed.data;

  // Honeypot: real visitors never fill the hidden "website" field. Bots usually fill every
  // field, so report fake success instead of a validation error that would tip them off.
  if (input.website) return json({ success: true }, 200);

  if (!input.phone && !input.email) return json({ error: "contact_method_required" }, 400);

  const admin = createSupabaseAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id")
    .eq("widget_key", input.widgetKey)
    .maybeSingle();
  if (!organization) return json({ error: "invalid_widget_key" }, 404);

  const { error } = await admin.from("leads").insert({
    organization_id: organization.id,
    full_name: input.name,
    company: input.company || null,
    email: input.email || null,
    phone: input.phone || null,
    source: "Website Widget",
    status: "new",
    notes: input.message || null,
    created_by: null,
  });
  if (error) return json({ error: "create_failed" }, 500);

  return json({ success: true }, 201);
}
