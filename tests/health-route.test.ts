import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/health/route";

function makeRequest(headersInit: HeadersInit = {}) {
  const headers = new Headers(headersInit);
  return new NextRequest("http://localhost/api/health", { headers });
}

test("health endpoint returns a minimal public payload and no-store headers", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET(makeRequest());
    const body = await response.json() as { status: string };

    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(body.status, "error");
    assert.equal(Object.keys(body).length, 1);
  } finally {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
    }

    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});

test("health endpoint performs DB probe only with valid HEALTH_CHECK_SECRET", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalHealthSecret = process.env.HEALTH_CHECK_SECRET;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-url.local";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";
    process.env.HEALTH_CHECK_SECRET = "super-secret-health";

    // 1. Without secret, just liveness (200 OK)
    const resPublic = await GET(makeRequest());
    assert.equal(resPublic.status, 200);
    const bodyPublic = (await resPublic.json()) as { status: string };
    assert.equal(bodyPublic.status, "ok");

    // 2. With wrong secret, just liveness (200 OK) - should not reveal failure
    const resWrong = await GET(makeRequest({ authorization: "Bearer wrong-secret" }));
    assert.equal(resWrong.status, 200);
    
    // 3. With SUPABASE_SERVICE_ROLE_KEY as auth header, just liveness (200 OK)
    const resServiceRole = await GET(makeRequest({ authorization: "Bearer fake-service-key" }));
    assert.equal(resServiceRole.status, 200);

    // 4. With correct secret (authorization header), attempts DB probe
    const resProtectedAuth = await GET(makeRequest({ authorization: "Bearer super-secret-health" }));
    assert.equal(resProtectedAuth.status, 503); // Fails because URL is fake and RPC fails

    // 5. With correct secret (x-health-check-secret header), attempts DB probe
    const resProtectedCustom = await GET(makeRequest({ "x-health-check-secret": "super-secret-health" }));
    assert.equal(resProtectedCustom.status, 503); // Fails because URL is fake and RPC fails
    
  } finally {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    if (originalHealthSecret === undefined) {
      delete process.env.HEALTH_CHECK_SECRET;
    } else {
      process.env.HEALTH_CHECK_SECRET = originalHealthSecret;
    }
  }
});
