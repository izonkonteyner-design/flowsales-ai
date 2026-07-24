export type SupabaseEnv = {
  url: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
};

export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? null,
  };
}

export function hasSupabaseConfig() {
  const env = getSupabaseEnv();
  return Boolean(env.url && env.anonKey);
}

export function getRequiredSupabaseEnv() {
  const env = getSupabaseEnv();
  if (!env.url || !env.anonKey) {
    return {
      configured: false as const,
      missing: [
        !env.url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
        !env.anonKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : null,
      ].filter(Boolean) as string[],
    };
  }

  return {
    configured: true as const,
    url: env.url,
    anonKey: env.anonKey,
  };
}
