import type { NextRequest } from "next/server";

/**
 * Validates that incoming POST requests have an explicit matching Same-Origin header.
 * Cookie authentication alone is not sufficient protection against CSRF.
 */
export function verifySameOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  const headerValue = originHeader || refererHeader;
  if (!headerValue) {
    return false; // Fail-closed: missing origin/referer header on POST request
  }

  try {
    const originUrl = new URL(headerValue);
    const originHost = originUrl.host.toLowerCase();

    const requestHost = (request.headers.get("host") || request.nextUrl.host).toLowerCase();

    // 1. Direct match with request Host
    if (originHost === requestHost) {
      return true;
    }

    // 2. Configured SITE_URL match
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
      try {
        const siteHost = new URL(siteUrl).host.toLowerCase();
        if (originHost === siteHost) {
          return true;
        }
      } catch {
        // Invalid SITE_URL env ignored
      }
    }

    // 3. Known production deployment domain
    if (originHost === "flowsales-ai-six.vercel.app") {
      return true;
    }

    // 4. Development environment localhost allowance
    const isDev =
      process.env.NODE_ENV === "development" ||
      requestHost.startsWith("localhost") ||
      requestHost.startsWith("127.0.0.1");

    if (
      isDev &&
      (originHost.startsWith("localhost:") ||
        originHost.startsWith("127.0.0.1:") ||
        originHost === "localhost" ||
        originHost === "127.0.0.1")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
