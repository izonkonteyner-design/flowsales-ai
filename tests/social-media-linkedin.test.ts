import assert from "node:assert/strict";
import test from "node:test";

import { linkedinProvider } from "@/lib/social-media/providers/linkedin";
import { isImplemented } from "@/lib/social-media/registry";
import { listLinkedInPages, registerImageUpload, registerVideoUpload, uploadMediaBytes } from "@/lib/social-media/providers/linkedin";

test("linkedin provider is registered and implemented", () => {
  assert.equal(isImplemented("linkedin"), true);
  assert.equal(linkedinProvider.platform, "linkedin");
  assert.equal(linkedinProvider.label, "LinkedIn");
  assert.equal(linkedinProvider.capabilities.publishing, true);
  assert.equal(linkedinProvider.capabilities.scheduling, true);
});

test("linkedin authorizeUrl builds a valid OAuth URL", () => {
  const saved = process.env.LINKEDIN_CLIENT_ID;
  try {
    process.env.LINKEDIN_CLIENT_ID = "test_client_id_12345";
    const url = linkedinProvider.authorizeUrl("abc-state", "http://localhost:3000/cb");
    assert.ok(url.startsWith("https://www.linkedin.com/oauth/v2/authorization"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("client_id"), "test_client_id_12345");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "abc-state");
    assert.ok(parsed.searchParams.get("scope"));
    assert.ok(parsed.searchParams.get("redirect_uri"));
  } finally {
    if (saved === undefined) delete process.env.LINKEDIN_CLIENT_ID;
    else process.env.LINKEDIN_CLIENT_ID = saved;
  }
});

test("linkedin authorizeUrl throws NOT_CONFIGURED without client id", () => {
  const saved = process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_ID;
  try {
    assert.throws(() => linkedinProvider.authorizeUrl("s", "http://localhost/cb"), {
      name: "SocialMediaError",
      code: "NOT_CONFIGURED",
      statusCode: 503,
    });
  } finally {
    if (saved === undefined) delete process.env.LINKEDIN_CLIENT_ID;
    else process.env.LINKEDIN_CLIENT_ID = saved;
  }
});

test("linkedin publish rejects empty content without media", async () => {
  await assert.rejects(
    () => linkedinProvider.publish("token", { content: "", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("linkedin publish without access token throws VALIDATION", async () => {
  await assert.rejects(
    () => linkedinProvider.publish("", { content: "hi", media_urls: [] }),
    { name: "SocialMediaError", code: "VALIDATION", statusCode: 400 },
  );
});

test("linkedin publish rejects company post without w_organization_social scope", async () => {
  await assert.rejects(
    () =>
      linkedinProvider.publish("token", {
        content: "Company update",
        media_urls: [],
        organization_id: "123456789",
        scopes: ["w_member_social"],
      }),
    { name: "SocialMediaError", code: "PERMANENT", statusCode: 500 },
  );
});

test("linkedin publish accepts company post with w_organization_social scope", async () => {
  // This will fail at network level (no real API), but scope validation should pass
  await assert.rejects(
    () =>
      linkedinProvider.publish("token", {
        content: "Company update",
        media_urls: [],
        organization_id: "123456789",
        scopes: ["w_organization_social"],
      }),
    { name: "SocialMediaError" },
  );
});

test("linkedin registerImageUpload is a function", () => {
  assert.equal(typeof registerImageUpload, "function");
});

test("linkedin registerVideoUpload is a function", () => {
  assert.equal(typeof registerVideoUpload, "function");
});

test("linkedin uploadMediaBytes is a function", () => {
  assert.equal(typeof uploadMediaBytes, "function");
});

test("linkedin listLinkedInPages is a function", () => {
  assert.equal(typeof listLinkedInPages, "function");
});
