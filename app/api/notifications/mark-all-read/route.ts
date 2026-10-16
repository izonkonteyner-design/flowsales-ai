import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export async function POST(request: NextRequest) {
  try {
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

    const { data: count, error } = await client.rpc("mark_all_notifications_read", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("[notifications] Mark all read error:", error);
      return NextResponse.json({ error: "Failed to mark all notifications as read" }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("[notifications] POST mark-all-read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}