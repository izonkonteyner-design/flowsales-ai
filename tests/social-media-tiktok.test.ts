import assert from "node:assert/strict";
import test from "node:test";

import { tiktokProvider } from "@/lib/social-media/providers/tiktok";
import { isImplemented } from "@/lib/social-media/registry";

test("tiktok provider is registered and implemented", () => {
  assert.equal(isImplemented("tiktok"), true);
  assert.equal(tiktokProvider.platform, "tiktok");
  assert.equal(tiktokProvider.label, "TikTok");
  assert.equal(tiktokProvider.capabilities.publishing, true);
  assert.equal(tiktokProvider.capabilities.scheduling, true);
});

test("tiktok authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.TIKTOK_CLIENT_KEY;
  try {
    process.env.TIKTOK_CLIENT_KEY = "test_client_key_12345";
    const url = tiktokProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://www.tiktok.com/v2/auth/authorize/"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_key"), "test_client_key_12345");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = saved;
  }
});

test("tiktok authorizeUrl throws NOT_CONFIGURED without client key", () => {
  const saved = process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_KEY;
  try {
    assert.throws(() => tiktokProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = saved;
  }
});

test("tiktok publish rejects empty content without media", async () => {
  await assert.rejects(
    () => tiktokProvider.publish("token", { content: "", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("tiktok publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => tiktokProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("tiktok publish rejects non-HTTPS media URLs", async () => {
  await assert.rejects(
    () =>
      tiktokProvider.publish("token", {
        content: "test",
        media_urls: ["http://example.com/video.mp4"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("tiktok publish rejects missing media", async () => {
  await assert.rejects(
    () => tiktokProvider.publish("token", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("tiktok publish invalid URL format throws VALIDATION", async () => {
  await assert.rejects(
    () =>
      tiktokProvider.publish("token", {
        content: "test",
        media_urls: ["not-a-url"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});
