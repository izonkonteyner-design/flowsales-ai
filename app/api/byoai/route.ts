import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkWorkspaceAiHealth,
  getWorkspaceAiSettings,
  updateWorkspaceAiSettings,
} from "@/server/services/byoai/service";
import { updateWorkspaceAiSettingsInputSchema } from "@/server/services/byoai/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "no_active_organization" }, { status: 403 });
  }

  const settings = await getWorkspaceAiSettings(supabase, member.organization_id);
  const health = await checkWorkspaceAiHealth(supabase, member.organization_id);

  return NextResponse.json({
    success: true,
    settings,
    health,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "no_active_organization" }, { status: 403 });
  }

  if (!["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "forbidden_requires_admin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateWorkspaceAiSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const updated = await updateWorkspaceAiSettings(supabase, member.organization_id, parsed.data);
    const health = await checkWorkspaceAiHealth(supabase, member.organization_id);
    return NextResponse.json({ success: true, settings: updated, health });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
