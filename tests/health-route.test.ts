import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { GET as publicHealthGET } from "@/app/api/health/route";
import { GET as internalHealthGET } from "@/app/api/health/internal/route";
import {
  handleInternalHealthProbe,
  resetInternalHealthRateLimitForTests,
} from "@/server/services/health";

function makeRequest(
  url: string,
  headersInit: HeadersInit = {},
) {
  const headers = new Headers(headersInit);
  return new NextRequest(url, { headers });
}

function snapshotEnv(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("public health endpoint returns a minimal cacheable liveness payload", async () => {
  const envSnapshot = snapshotEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HEALTH_CHECK_SECRET",
  ]);

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.HEALTH_CHECK_SECRET;

    const response = await publicHealthGET();
    const body = (await response.json()) as { status: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(Object.keys(body).length, 1);
    assert.match(response.headers.get("cache-control") ?? "", /public/);
    assert.match(response.headers.get("cache-control") ?? "", /s-maxage=30/);
    assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate=300/);
    assert.equal(response.headers.get("pragma"), "no-cache");
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("internal health probe rejects wrong or replayed credentials before probing the database", async () => {
  resetInternalHealthRateLimitForTests();

  const request = makeRequest("http://localhost/api/health/internal", {
    authorization: "Bearer wrong-secret",
  });

  let probeCalled = 0;
  const response = await handleInternalHealthProbe(
    request,
    async () => {
      probeCalled += 1;
      return true;
    },
    "super-secret-health",
  );

  const body = (await response.json()) as { status: string };

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");
  assert.equal(probeCalled, 0);
});

test("service role credentials are not accepted as internal health auth", async () => {
  resetInternalHealthRateLimitForTests();

  const request = makeRequest("http://localhost/api/health/internal", {
    authorization: "Bearer fake-service-role-key",
  });

  let probeCalled = 0;
  const response = await handleInternalHealthProbe(
    request,
    async () => {
      probeCalled += 1;
      return true;
    },
    "super-secret-health",
  );

  assert.equal(response.status, 404);
  assert.equal(probeCalled, 0);
});

test("internal health probe succeeds with the shared secret and fails closed on probe errors", async () => {
  resetInternalHealthRateLimitForTests();

  const successRequest = makeRequest("http://localhost/api/health/internal", {
    "x-health-check-secret": "super-secret-health",
    "x-forwarded-for": "203.0.113.15",
  });

  let successProbeCalled = 0;
  const successResponse = await handleInternalHealthProbe(
    successRequest,
    async () => {
      successProbeCalled += 1;
      return true;
    },
    "super-secret-health",
  );

  const successBody = (await successResponse.json()) as { status: string };
  assert.equal(successResponse.status, 200);
  assert.equal(successBody.status, "ok");
  assert.equal(successProbeCalled, 1);

  const failureRequest = makeRequest("http://localhost/api/health/internal", {
    "x-health-check-secret": "super-secret-health",
    "x-forwarded-for": "203.0.113.16",
  });

  const failureResponse = await handleInternalHealthProbe(
    failureRequest,
    async () => {
      throw new Error("database exploded");
    },
    "super-secret-health",
  );

  const failureBody = (await failureResponse.json()) as { status: string };
  assert.equal(failureResponse.status, 503);
  assert.equal(failureBody.status, "error");
  assert.equal(Object.keys(failureBody).length, 1);
  assert.equal(JSON.stringify(failureBody).includes("database exploded"), false);
  assert.equal(JSON.stringify(failureBody).includes("super-secret-health"), false);
});

test("internal health probe rate limits repeated requests and reports retry-after", async () => {
  resetInternalHealthRateLimitForTests();

  const attempts: number[] = [];
  const request = makeRequest("http://localhost/api/health/internal", {
    "x-health-check-secret": "super-secret-health",
    "x-forwarded-for": "198.51.100.11",
  });

  for (let index = 0; index < 5; index += 1) {
    const response = await handleInternalHealthProbe(
      request,
      async () => {
        attempts.push(index);
        return true;
      },
      "super-secret-health",
    );

    assert.equal(response.status, 200);
  }

  const limitedResponse = await handleInternalHealthProbe(
    request,
    async () => {
      attempts.push(99);
      return true;
    },
    "super-secret-health",
  );

  const limitedBody = (await limitedResponse.json()) as { status: string };
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedBody.status, "degraded");
  assert.ok((limitedResponse.headers.get("retry-after") ?? "").length > 0);
  assert.equal(attempts.includes(99), false);
});

test("route wrapper still rejects invalid internal auth without surfacing details", async () => {
  resetInternalHealthRateLimitForTests();

  const originalSecret = process.env.HEALTH_CHECK_SECRET;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  try {
    process.env.HEALTH_CHECK_SECRET = "super-secret-health";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-public-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await internalHealthGET(
      makeRequest("http://localhost/api/health/internal", {
        authorization: "Bearer wrong-secret",
      }),
    );

    const body = (await response.json()) as { status: string };
    assert.equal(response.status, 404);
    assert.equal(body.status, "error");
    assert.equal(Object.keys(body).length, 1);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.HEALTH_CHECK_SECRET;
    } else {
      process.env.HEALTH_CHECK_SECRET = originalSecret;
    }

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
  }
});
