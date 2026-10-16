import assert from "node:assert/strict";
import test from "node:test";

import { youtubeProvider } from "@/lib/social-media/providers/youtube";
import { isImplemented } from "@/lib/social-media/registry";

test("youtube provider is registered and implemented", () => {
  assert.equal(isImplemented("youtube"), true);
  assert.equal(youtubeProvider.platform, "youtube");
  assert.equal(youtubeProvider.label, "YouTube");
  assert.equal(youtubeProvider.capabilities.publishing, true);
  assert.equal(youtubeProvider.capabilities.scheduling, true);
});

test("youtube authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.YOUTUBE_CLIENT_ID;
  try {
    process.env.YOUTUBE_CLIENT_ID = "test_client_id_12345.apps.googleusercontent.com";
    const url = youtubeProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
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
    if (saved === undefined) delete process.env.YOUTUBE_CLIENT_ID;
    else process.env.YOUTUBE_CLIENT_ID = saved;
  }
});

test("youtube authorizeUrl throws NOT_CONFIGURED without client id", () => {
  const saved = process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_ID;
  try {
    assert.throws(() => youtubeProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.YOUTUBE_CLIENT_ID;
    else process.env.YOUTUBE_CLIENT_ID = saved;
  }
});

test("youtube publish rejects empty content without media", async () => {
  await assert.rejects(
    () => youtubeProvider.publish("token", { content: "", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("youtube publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => youtubeProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("youtube publish rejects missing media", async () => {
  await assert.rejects(
    () => youtubeProvider.publish("token", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("youtube publish rejects non-HTTPS media URLs", async () => {
  await assert.rejects(
    () =>
      youtubeProvider.publish("token", {
        content: "test",
        media_urls: ["http://example.com/video.mp4"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("youtube publish rejects private/internal hosts (SSRF)", async () => {
  await assert.rejects(
    () =>
      youtubeProvider.publish("token", {
        content: "test",
        media_urls: ["https://192.168.1.1/video.mp4"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});

test("youtube publish rejects invalid URL format", async () => {
  await assert.rejects(
    () =>
      youtubeProvider.publish("token", {
        content: "test",
        media_urls: ["not-a-url"],
      }),
    { name: "SocialMediaError", code: "VALIDATION" },
  );
});
