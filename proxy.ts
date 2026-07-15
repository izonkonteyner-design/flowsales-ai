import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";

const protectedRoutes = [
  "/dashboard",
  "/leads",
  "/customers",
  "/products",
  "/quotes",
  "/tasks",
  "/calendar",
  "/notifications",
  "/ai",
  "/reports",
  "/billing",
  "/team",
  "/permissions",
  "/audit-logs",
  "/api-layer",
  "/settings",
];

export async function proxy(request: NextRequest) {
  const env = getRequiredSupabaseEnv();
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (!env.configured) {
    return response;
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = protectedRoutes.some((route) =>
    request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`),
  );

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && ["/login", "/signup"].includes(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
