import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  activateIndustryPack,
  getActiveIndustryPack,
  getIndustryPackPresets,
} from "@/server/services/industry-packs/service";
import { industryPackKeySchema } from "@/server/services/industry-packs/domain";

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

  const availablePresets = getIndustryPackPresets();
  const activePack = await getActiveIndustryPack(supabase, member.organization_id);

  return NextResponse.json({
    success: true,
    activePack,
    availablePresets,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsedKey = industryPackKeySchema.safeParse(body.packKey);
  if (!parsedKey.success) {
    return NextResponse.json({ error: "invalid_pack_key" }, { status: 400 });
  }

  try {
    const updated = await activateIndustryPack(supabase, member.organization_id, parsedKey.data, user.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
