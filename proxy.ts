import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { normalizeSafeRedirectPath } from "@/lib/validations/auth";

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

const authPages = ["/login", "/signup", "/register"];

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie.name, cookie.value, cookie);
  }
}

function buildRedirectResponse(
  request: NextRequest,
  pathname: string,
  nextPath?: string,
  extraQuery?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (nextPath) {
    url.searchParams.set("next", nextPath);
  }
  if (extraQuery) {
    for (const [key, value] of Object.entries(extraQuery)) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
}

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

  const pathname = request.nextUrl.pathname;
  const nextPath = normalizeSafeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
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

  let membership: { organization_id: string; role: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    membership = data ?? null;
  }

  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthPage = authPages.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isBootstrapRoute = pathname === "/register" && request.nextUrl.searchParams.get("bootstrap") === "1";
  const targetNext = isProtected ? pathname : nextPath;

  if (!user && isProtected) {
    const redirectResponse = buildRedirectResponse(request, "/login", targetNext);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (user && !membership) {
    if (isBootstrapRoute) {
      return response;
    }

    const redirectResponse = buildRedirectResponse(request, "/register", targetNext, { bootstrap: "1" });
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (user && membership && isAuthPage) {
    const redirectResponse = buildRedirectResponse(request, "/dashboard", targetNext);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
