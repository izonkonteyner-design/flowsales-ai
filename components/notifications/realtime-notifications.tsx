"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function RealtimeNotifications({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const channel = client
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [router, userId]);

  return null;
}
