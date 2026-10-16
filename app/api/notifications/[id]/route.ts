import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const client = await createSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ error: "Supabase client unavailable" }, { status: 503 });
    }

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: success, error } = await client.rpc("mark_notification_read", {
      p_notification_id: id,
      p_user_id: user.id,
    });

    if (error) {
      console.error("[notifications] Mark read error:", error);
      return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
    }

    return NextResponse.json({ success: !!success });
  } catch (error) {
    console.error("[notifications] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}