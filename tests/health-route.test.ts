import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/health/route";

function makeRequest(ip: string) {
  return new NextRequest("http://localhost/api/health", {
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

test("health endpoint returns a minimal public payload and no-store headers", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET(makeRequest("203.0.113.10"));
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

test("health endpoint rate limits repeated requests from the same client", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const clientIp = "198.51.100.55";
    let response: Response | undefined;

    for (let i = 0; i < 21; i += 1) {
      response = await GET(makeRequest(clientIp));
    }

    assert.ok(response);
    assert.equal(response.status, 429);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "degraded");
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
