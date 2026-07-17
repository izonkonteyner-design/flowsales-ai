import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { normalizeSafeRedirectPath } from "@/lib/validations/auth";

function createRedirectResponse(request: NextRequest, targetPath: string) {
  return NextResponse.redirect(new URL(targetPath, request.url));
}

export async function GET(request: NextRequest) {
  const env = getRequiredSupabaseEnv();
  const nextPath = normalizeSafeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const errorCode = request.nextUrl.searchParams.get("error_code");

  if (!env.configured) {
    return createRedirectResponse(request, "/login");
  }

  const fallbackPath = type === "recovery" ? `/reset-password?next=${encodeURIComponent(nextPath)}` : nextPath;
  const response = createRedirectResponse(request, fallbackPath);
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return createRedirectResponse(request, `/login?next=${encodeURIComponent(nextPath)}`);
    }

    return response;
  }

  if (errorDescription || errorCode) {
    return createRedirectResponse(request, `/login?next=${encodeURIComponent(nextPath)}`);
  }

  return response;
}
