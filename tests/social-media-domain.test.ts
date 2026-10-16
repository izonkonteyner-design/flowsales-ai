import assert from "node:assert/strict";
import test from "node:test";

import {
  getProvider,
  listProviders,
  isImplemented,
} from "@/lib/social-media/registry";
import { SocialMediaError } from "@/lib/social-media/providers/base";
import { instagramProvider } from "@/lib/social-media/providers/instagram";
import {
  createSocialMediaPostSchema,
  connectSocialAccountSchema,
} from "@/lib/social-media/validation";

test("social media registry exposes Instagram, Facebook, TikTok, YouTube and Google Business Profile as implemented providers", () => {
  const providers = listProviders();

  const instagram = providers.find((p) => p.platform === "instagram");
  assert.equal(instagram?.implemented, true);
  assert.equal(instagram?.label, "Instagram");

  const facebook = providers.find((p) => p.platform === "facebook");
  assert.equal(facebook?.implemented, true);
  assert.equal(facebook?.label, "Facebook Pages");

  const tiktok = providers.find((p) => p.platform === "tiktok");
  assert.equal(tiktok?.implemented, true);
  assert.equal(tiktok?.label, "TikTok");

  const youtube = providers.find((p) => p.platform === "youtube");
  assert.equal(youtube?.implemented, true);
  assert.equal(youtube?.label, "YouTube");

  const googleBusiness = providers.find((p) => p.platform === "google_business");
  assert.equal(googleBusiness?.implemented, true);
  assert.equal(googleBusiness?.label, "Google Business Profile");

  const linkedin = providers.find((p) => p.platform === "linkedin");
  assert.equal(linkedin?.implemented, true);
  assert.equal(linkedin?.label, "LinkedIn");

  const threads = providers.find((p) => p.platform === "threads");
  assert.equal(threads?.implemented, true);
  assert.equal(threads?.label, "Threads");

  const notImplemented = providers.filter(
    (p) =>
      p.platform !== "instagram" &&
      p.platform !== "facebook" &&
      p.platform !== "tiktok" &&
      p.platform !== "youtube" &&
      p.platform !== "google_business" &&
      p.platform !== "linkedin" &&
      p.platform !== "threads",
  );
  assert.ok(notImplemented.length > 0);
  assert.ok(notImplemented.every((p) => p.implemented === false));

  assert.equal(isImplemented("instagram"), true);
  assert.equal(isImplemented("facebook"), true);
  assert.equal(isImplemented("tiktok"), true);
  assert.equal(isImplemented("youtube"), true);
  assert.equal(isImplemented("google_business"), true);
  assert.equal(isImplemented("linkedin"), true);
  assert.equal(isImplemented("threads"), true);
  assert.equal(isImplemented("pinterest"), false);
});

test("registry throws NOT_CONFIGURED for unimplemented platforms", () => {
  assert.throws(() => getProvider("pinterest"), {
    name: "SocialMediaError",
  });

  try {
    getProvider("x");
    assert.fail("should have thrown");
  } catch (error) {
    assert.equal((error as SocialMediaError).code, "NOT_CONFIGURED");
    assert.equal((error as SocialMediaError).statusCode, 503);
  }
});

test("instagram provider metadata and capabilities", () => {
  assert.equal(instagramProvider.platform, "instagram");
  assert.equal(instagramProvider.label, "Instagram");
  assert.equal(instagramProvider.capabilities.publishing, true);
  assert.equal(instagramProvider.capabilities.scheduling, true);
  assert.equal(instagramProvider.capabilities.analytics, false);
  assert.equal(typeof instagramProvider.authorizeUrl, "function");
  assert.equal(typeof instagramProvider.exchangeCode, "function");
  assert.equal(typeof instagramProvider.publish, "function");
  assert.equal(typeof instagramProvider.getAccount, "function");
});

test("instagram authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.INSTAGRAM_CLIENT_ID;
  const savedRedirect = process.env.INSTAGRAM_REDIRECT_URI;
  try {
    process.env.INSTAGRAM_CLIENT_ID = "1234567890";
    process.env.INSTAGRAM_REDIRECT_URI = "http://localhost:3000/api/social-media/accounts";

    const url = instagramProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://api.instagram.com/oauth/authorize"));

    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "1234567890");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.INSTAGRAM_CLIENT_ID;
    else process.env.INSTAGRAM_CLIENT_ID = saved;
    if (savedRedirect === undefined) delete process.env.INSTAGRAM_REDIRECT_URI;
    else process.env.INSTAGRAM_REDIRECT_URI = savedRedirect;
  }
});

test("instagram authorizeUrl throws NOT_CONFIGURED without client id", () => {
  const saved = process.env.INSTAGRAM_CLIENT_ID;
  delete process.env.INSTAGRAM_CLIENT_ID;
  try {
    assert.throws(() => instagramProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
    });
  } finally {
    if (saved === undefined) delete process.env.INSTAGRAM_CLIENT_ID;
    else process.env.INSTAGRAM_CLIENT_ID = saved;
  }
});

test("create post schema accepts draft and scheduled posts", () => {
  const draft = createSocialMediaPostSchema.parse({
    platform: "instagram",
    status: "draft",
    content: "Merhaba FlowSales",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.content, "Merhaba FlowSales");
  assert.deepEqual(draft.media_urls, []);

  const scheduled = createSocialMediaPostSchema.parse({
    account_id: "00000000-0000-0000-0000-000000000000",
    platform: "instagram",
    status: "scheduled",
    content: "Zamanlanmış mesaj",
    media_urls: ["https://example.com/img.jpg"],
    scheduled_at: "2026-08-01T10:00:00Z",
  });
  assert.equal(scheduled.status, "scheduled");
  assert.deepEqual(scheduled.media_urls, ["https://example.com/img.jpg"]);
});

test("create post schema rejects empty content and bad URLs", () => {
  assert.throws(() =>
    createSocialMediaPostSchema.parse({
      platform: "instagram",
      status: "draft",
      content: "",
    }),
  );

  assert.throws(() =>
    createSocialMediaPostSchema.parse({
      platform: "instagram",
      status: "draft",
      content: "x",
      media_urls: ["not-a-url"],
    }),
  );
});

test("connect account schema requires platform, code and redirect_uri", () => {
  const valid = connectSocialAccountSchema.parse({
    platform: "instagram",
    code: "def456",
    redirect_uri: "http://localhost:3000/api/social-media/accounts",
  });
  assert.equal(valid.platform, "instagram");
  assert.equal(valid.code, "def456");

  assert.throws(() =>
    connectSocialAccountSchema.parse({
      platform: "instagram",
      code: "",
      redirect_uri: "not-a-url",
    }),
  );
});
