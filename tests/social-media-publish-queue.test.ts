import assert from "node:assert/strict";
import test from "node:test";

import { calculateNextRetry } from "@/server/services/social-media-publish";
import { instagramProvider } from "@/lib/social-media/providers/instagram";
import { SocialMediaError } from "@/lib/social-media/providers/base";

test("calculateNextRetry applies exponential backoff", () => {
  const r1 = calculateNextRetry(0);
  assert.equal(r1.nextRetryCount, 1);
  assert.ok(r1.nextRetryAt);
  const t1 = new Date(r1.nextRetryAt!).getTime();
  const expected1 = Date.now() + 5 * 60 * 1000;
  assert.ok(t1 >= expected1 - 1000 && t1 <= expected1 + 1000, "5 min backoff");

  const r2 = calculateNextRetry(1);
  assert.equal(r2.nextRetryCount, 2);
  const t2 = new Date(r2.nextRetryAt!).getTime();
  const expected2 = Date.now() + 10 * 60 * 1000;
  assert.ok(t2 >= expected2 - 1000 && t2 <= expected2 + 1000, "10 min backoff");

  const r3 = calculateNextRetry(2);
  assert.equal(r3.nextRetryCount, 3);
  const t3 = new Date(r3.nextRetryAt!).getTime();
  const expected3 = Date.now() + 20 * 60 * 1000;
  assert.ok(t3 >= expected3 - 1000 && t3 <= expected3 + 1000, "20 min backoff");
});

test("calculateNextRetry stops after MAX_RETRIES", () => {
  const r = calculateNextRetry(5);
  assert.equal(r.nextRetryCount, 6);
  assert.equal(r.nextRetryAt, null);
});

test("mock provider publish flow returns a result", async () => {
  const mockPublish = async (
    accessToken: string,
    post: { content: string; media_urls: string[] },
  ) => {
    assert.ok(accessToken, "access token must be provided");
    assert.ok(post.content.trim(), "content must not be empty");
    return {
      platform_post_id: "ig_post_12345",
      platform_post_url: "https://instagram.com/p/ig_post_12345",
    };
  };

  const result = await mockPublish("valid-token", {
    content: "Merhaba FlowSales",
    media_urls: [],
  });
  assert.equal(result.platform_post_id, "ig_post_12345");
  assert.equal(result.platform_post_url, "https://instagram.com/p/ig_post_12345");
});

test("mock provider publish rejects empty content", async () => {
  const mockPublish = async (
    _accessToken: string,
    post: { content: string; media_urls: string[] },
  ) => {
    if (!post.content.trim() && post.media_urls.length === 0) {
      throw SocialMediaError.validation("A post must contain text or media.");
    }
    return { platform_post_id: "x", platform_post_url: null };
  };

  await assert.rejects(
    () => mockPublish("token", { content: "", media_urls: [] }),
    {
      name: "SocialMediaError",
      code: "VALIDATION",
    },
  );
});

test("instagram provider throws NOT_CONFIGURED without credentials", () => {
  const prev = process.env.INSTAGRAM_CLIENT_ID;
  delete process.env.INSTAGRAM_CLIENT_ID;
  try {
    assert.throws(
      () => instagramProvider.authorizeUrl("state", "http://localhost/cb"),
      {
        name: "SocialMediaError",
        code: "NOT_CONFIGURED",
        statusCode: 503,
      },
    );
  } finally {
    if (prev === undefined) delete process.env.INSTAGRAM_CLIENT_ID;
    else process.env.INSTAGRAM_CLIENT_ID = prev;
  }
});
