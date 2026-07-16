"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const env = getRequiredSupabaseEnv();

  if (!env.configured) {
    return null;
  }

  browserClient = createBrowserClient(env.url, env.anonKey, {
    cookieOptions: {
      name: "flowsales-auth",
    },
  });

  return browserClient;
}

export function createAnonymousSupabaseClient() {
  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return null;
  }

  return createSupabaseClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
