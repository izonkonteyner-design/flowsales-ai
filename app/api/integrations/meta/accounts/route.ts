import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { selectMetaMessagingAccount, type MetaMessagingProvider } from "@/server/services/integrations/meta-messaging-oauth";

type AuthenticatedContext = NonNullable<Awaited<ReturnType<typeof loadWorkspaceContext>>> & { userId: string };

async function context(): Promise<AuthenticatedContext | null> {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return null;
  if (ctx.mode === "demo" || !["owner", "admin"].includes(ctx.role)) return null;
  return { ...ctx, userId: ctx.userId } as AuthenticatedContext;
}

export async function GET(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const provider = request.nextUrl.searchParams.get("provider");
  if (provider !== "instagram" && provider !== "facebook") return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("channel_connections").select("id,status")
    .eq("organization_id", ctx.organization.id).eq("provider", provider).maybeSingle();
  if (!connection) return NextResponse.json({ candidates: [], status: "not_connected" });
  const { data } = await admin.from("channel_accounts").select("external_id,external_username,display_name,metadata")
    .eq("organization_id", ctx.organization.id).eq("connection_id", connection.id).eq("provider", provider).order("display_name");
  return NextResponse.json({ status: connection.status, candidates: (data || []).map((row) => ({
    externalId: row.external_id, username: row.external_username, displayName: row.display_name,
    selected: (row.metadata as Record<string, unknown> | null)?.selection_status === "selected",
  })) });
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => null) as { provider?: string; externalAccountId?: string } | null;
  if (!body || (body.provider !== "instagram" && body.provider !== "facebook") || !body.externalAccountId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const result = await selectMetaMessagingAccount({
      organizationId: ctx.organization.id, userId: ctx.userId,
      provider: body.provider as MetaMessagingProvider, externalAccountId: body.externalAccountId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "selection_failed", message: error instanceof Error ? error.message : "Selection failed." }, { status: 400 });
  }
}
