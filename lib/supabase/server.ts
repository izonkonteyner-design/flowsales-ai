import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; the middleware refresh flow handles updates.
        }
      },
    },
  }) as SupabaseClient;
}

export async function getSupabaseSessionUser() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getUser();
  return data.user ?? null;
}
