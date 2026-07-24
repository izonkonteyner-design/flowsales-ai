import { z } from "zod";

export const serverEnvSchema = z.object({
  // Critical / Core
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "Publishable key is required").optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Anon key is required").optional(),
  
  // Optional: Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash").optional(),

  // Feature-specific: Demo Mode
  DEMO_USER_EMAIL: z.string().email().optional(),
  DEMO_USER_PASSWORD: z.string().min(1).optional(),
  DEMO_RATE_LIMIT_SECRET: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Optional: Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // URLs
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
}).refine(
  (data) => data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    message: "Either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY must be provided",
    path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  }
);

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function normalizeUrlCandidate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getResolvedSiteUrl(envData: Partial<ServerEnv>): string {
  let url =
    normalizeUrlCandidate(envData.NEXT_PUBLIC_SITE_URL) ??
    normalizeUrlCandidate(envData.NEXT_PUBLIC_APP_URL) ??
    normalizeUrlCandidate(envData.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeUrlCandidate(envData.NEXT_PUBLIC_VERCEL_URL) ??
    normalizeUrlCandidate(envData.VERCEL_URL) ??
    "http://localhost:3000";

  if (url && !url.startsWith("http")) {
    url = `https://${url}`;
  }

  return url;
}

export function validateServerEnv() {
  const envVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim(),
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim(),
    DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL?.trim(),
    DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD?.trim(),
    DEMO_RATE_LIMIT_SECRET: process.env.DEMO_RATE_LIMIT_SECRET?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL?.trim(),
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim(),
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL?.trim(),
    VERCEL_URL: process.env.VERCEL_URL?.trim(),
  };

  const parsed = serverEnvSchema.safeParse(envVars);

  if (!parsed.success) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Environment validation failed",
        errors: parsed.error.format(),
      })
    );
    return {
      success: false as const,
      data: null,
      errors: parsed.error.format(),
      resolvedSiteUrl: "http://localhost:3000",
    };
  }

  return {
    success: true as const,
    data: parsed.data,
    resolvedSiteUrl: getResolvedSiteUrl(parsed.data),
  };
}
