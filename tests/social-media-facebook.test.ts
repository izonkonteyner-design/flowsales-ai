import assert from "node:assert/strict";
import test from "node:test";

import { facebookProvider } from "@/lib/social-media/providers/facebook";
import { isImplemented } from "@/lib/social-media/registry";

test("facebook provider is registered and implemented", () => {
  assert.equal(isImplemented("facebook"), true);
  assert.equal(facebookProvider.platform, "facebook");
  assert.equal(facebookProvider.label, "Facebook Pages");
  assert.equal(facebookProvider.capabilities.publishing, true);
  assert.equal(facebookProvider.capabilities.scheduling, true);
});

test("facebook authorizeUrl builds a valid OAuth dialog URL", () => {
  const saved = process.env.FACEBOOK_APP_ID;
  try {
    process.env.FACEBOOK_APP_ID = "123456789012345";
    const url = facebookProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://www.facebook.com/v19.0/dialog/oauth"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "123456789012345");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.FACEBOOK_APP_ID;
    else process.env.FACEBOOK_APP_ID = saved;
  }
});

test("facebook authorizeUrl throws NOT_CONFIGURED without app id", () => {
  const saved = process.env.FACEBOOK_APP_ID;
  delete process.env.FACEBOOK_APP_ID;
  try {
    assert.throws(() => facebookProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.FACEBOOK_APP_ID;
    else process.env.FACEBOOK_APP_ID = saved;
  }
});

test("facebook publish rejects empty content without media", async () => {
  const saved = process.env.FACEBOOK_APP_ID;
  try {
    process.env.FACEBOOK_APP_ID = "x"; // only needed to avoid NOT_CONFIGURED in requireEnv? publish doesn't call requireEnv
    await assert.rejects(
      () => facebookProvider.publish("token", { content: "", media_urls: [] }),
      { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
    );
  } finally {
    if (saved === undefined) delete process.env.FACEBOOK_APP_ID;
    else process.env.FACEBOOK_APP_ID = saved;
  }
});

test("facebook publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => facebookProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});
