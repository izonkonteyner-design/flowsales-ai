import assert from "node:assert/strict";
import test from "node:test";

import { googleBusinessProvider } from "@/lib/social-media/providers/google-business";
import { isImplemented } from "@/lib/social-media/registry";

test("google business provider is registered and implemented", () => {
  assert.equal(isImplemented("google_business"), true);
  assert.equal(googleBusinessProvider.platform, "google_business");
  assert.equal(googleBusinessProvider.label, "Google Business Profile");
  assert.equal(googleBusinessProvider.capabilities.publishing, true);
  assert.equal(googleBusinessProvider.capabilities.scheduling, false);
});

test("google business authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.GBP_CLIENT_ID;
  try {
    process.env.GBP_CLIENT_ID = "test_client_id_12345.apps.googleusercontent.com";
    const url = googleBusinessProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "test_client_id_12345.apps.googleusercontent.com");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("access_type"), "offline");
    assert.equal(parsed.searchParams.get("prompt"), "consent");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.GBP_CLIENT_ID;
    else process.env.GBP_CLIENT_ID = saved;
  }
});

test("google business authorizeUrl throws NOT_CONFIGURED without client id", () => {
  const saved = process.env.GBP_CLIENT_ID;
  delete process.env.GBP_CLIENT_ID;
  try {
    assert.throws(() => googleBusinessProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.GBP_CLIENT_ID;
    else process.env.GBP_CLIENT_ID = saved;
  }
});

test("google business publish rejects empty content without media", async () => {
  await assert.rejects(
    () => googleBusinessProvider.publish("token", { content: "", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("google business publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => googleBusinessProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("google business publish rejects scheduled_at (API limitation)", async () => {
  await assert.rejects(
    () =>
      googleBusinessProvider.publish("token", {
        content: "test",
        media_urls: [],
        scheduled_at: "2026-08-01T10:00:00Z",
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("google business publish rejects non-HTTPS media URLs", async () => {
  await assert.rejects(
    () =>
      googleBusinessProvider.publish("token", {
        content: "test",
        media_urls: ["http://example.com/image.jpg"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("google business publish rejects private/internal hosts (SSRF)", async () => {
  await assert.rejects(
    () =>
      googleBusinessProvider.publish("token", {
        content: "test",
        media_urls: ["https://192.168.1.1/image.jpg"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("google business publish rejects invalid URL format", async () => {
  await assert.rejects(
    () =>
      googleBusinessProvider.publish("token", {
        content: "test",
        media_urls: ["not-a-url"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});
