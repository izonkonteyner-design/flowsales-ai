import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const context = await getWorkspaceContext();

    if (context.mode === "demo") {
      return NextResponse.json({ notifications: [], unread_count: 0, has_more: false });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ notifications: [], unread_count: 0, has_more: false });
    }

    const client = await createSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ notifications: [], unread_count: 0, has_more: false });
    }

    // Get user ID from auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get unread count
    const { data: countResult, error: countError } = await client.rpc("get_unread_notification_count", {
      p_user_id: user.id,
    });

    if (countError) {
      console.error("[notifications] Count error:", countError);
    }

    // Get notifications
    const { data: notifications, error: listError } = await client.rpc("list_user_notifications", {
      p_user_id: user.id,
      p_limit: limit + 1, // fetch one extra to check has_more
      p_offset: offset,
    });

    if (listError) {
      console.error("[notifications] List error:", listError);
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }

    const hasMore = (notifications?.length || 0) > limit;
    const items = hasMore ? (notifications || []).slice(0, limit) : (notifications || []);

    return NextResponse.json({
      notifications: items,
      unread_count: countResult || 0,
      has_more: hasMore,
    });
  } catch (error) {
    console.error("[notifications] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}