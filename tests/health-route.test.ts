import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/health/route";

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost/api/health", {
    headers,
  });
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

test("health endpoint performs DB probe only with valid secret", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-url.local";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

    // 1. Without secret, just liveness
    const resPublic = await GET(makeRequest());
    assert.equal(resPublic.status, 200);
    const bodyPublic = (await resPublic.json()) as { status: string };
    assert.equal(bodyPublic.status, "ok");

    // 2. With secret, DB probe fails (503) because URL is fake and createSupabaseServerClient returns error/fails rpc
    const resProtected = await GET(makeRequest("Bearer fake-service-key"));
    assert.equal(resProtected.status, 503);
    const bodyProtected = (await resProtected.json()) as { status: string };
    assert.equal(bodyProtected.status, "error");
    
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
  }
});
