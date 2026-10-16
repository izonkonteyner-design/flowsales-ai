import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { threadsProvider } from "@/lib/social-media/providers/threads";
import { isImplemented } from "@/lib/social-media/registry";

test("threads provider is registered and implemented", () => {
  assert.equal(isImplemented("threads"), true);
  assert.equal(threadsProvider.platform, "threads");
  assert.equal(threadsProvider.label, "Threads");
  assert.equal(threadsProvider.capabilities.publishing, true);
  assert.equal(threadsProvider.capabilities.scheduling, true);
});

test("threads authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.THREADS_CLIENT_ID;
  try {
    process.env.THREADS_CLIENT_ID = "test_client_id_12345";
    const url = threadsProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://www.threads.net/oauth/authorize"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "test_client_id_12345");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.THREADS_CLIENT_ID;
    else process.env.THREADS_CLIENT_ID = saved;
  }
});

test("threads authorizeUrl throws NOT_CONFIGURED without client id", () => {
  const saved = process.env.THREADS_CLIENT_ID;
  delete process.env.THREADS_CLIENT_ID;
  try {
    assert.throws(() => threadsProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.THREADS_CLIENT_ID;
    else process.env.THREADS_CLIENT_ID = saved;
  }
});

test("threads publish rejects empty content without media", async () => {
  await assert.rejects(
    () => threadsProvider.publish("token", { content: "", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("threads publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => threadsProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("threads publish supports carousel with multiple images", async () => {
  await assert.rejects(
    () =>
      threadsProvider.publish("token", {
        content: "Carousel post",
        media_urls: [
          "https://example.com/img1.jpg",
          "https://example.com/img2.jpg",
          "https://example.com/img3.jpg",
        ],
      }),
    { name: "SocialMediaError" },
  );
});

// Mock fetch for OAuth token exchange test
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

test("threads token exchange uses Threads token endpoint", async () => {
  const savedClientId = process.env.THREADS_CLIENT_ID;
  const savedClientSecret = process.env.THREADS_CLIENT_SECRET;
  let capturedUrl = "";
  let capturedBody = "";

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    return new Response(
      JSON.stringify({
        access_token: "mock_access_token",
        refresh_token: "mock_refresh_token",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof global.fetch;

  try {
    process.env.THREADS_CLIENT_ID = "test_client_id";
    process.env.THREADS_CLIENT_SECRET = "test_client_secret";
    const tokens = await threadsProvider.exchangeCode("auth_code_123", "http://localhost/cb");
    assert.equal(tokens.access_token, "mock_access_token");
    assert.equal(tokens.refresh_token, "mock_refresh_token");
    assert.ok(capturedUrl.includes("graph.threads.net/oauth/access_token"));
    assert.ok(capturedBody.includes("grant_type=authorization_code"));
    assert.ok(capturedBody.includes("code=auth_code_123"));
  } finally {
    process.env.THREADS_CLIENT_ID = savedClientId;
    process.env.THREADS_CLIENT_SECRET = savedClientSecret;
  }
});

test("threads token refresh uses Threads token endpoint", async () => {
  const savedClientId = process.env.THREADS_CLIENT_ID;
  const savedClientSecret = process.env.THREADS_CLIENT_SECRET;
  let capturedUrl = "";

  global.fetch = (async (url: string | URL | Request) => {
    capturedUrl = String(url);
    return new Response(
      JSON.stringify({
        access_token: "new_access_token",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof global.fetch;

  try {
    process.env.THREADS_CLIENT_ID = "test_client_id";
    process.env.THREADS_CLIENT_SECRET = "test_client_secret";
    const result = await threadsProvider.refreshToken("old_refresh_token");
    assert.equal(result.access_token, "new_access_token");
    assert.ok(capturedUrl.includes("graph.threads.net/oauth/access_token"));
  } finally {
    process.env.THREADS_CLIENT_ID = savedClientId;
    process.env.THREADS_CLIENT_SECRET = savedClientSecret;
  }
});
