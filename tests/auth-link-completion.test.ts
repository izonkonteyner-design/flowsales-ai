import test from "node:test";
import assert from "node:assert/strict";
import { completeAuthLink } from "@/lib/auth/complete-link";

const hash = "#access_token=test-access&refresh_token=test-refresh&type=recovery";
function authFixture(sessionError: unknown = null, user: unknown | null = { id: "test-user" }) {
  const calls: string[] = [];
  return {
    calls,
    auth: {
      async setSession() { calls.push("setSession"); return { error: sessionError }; },
      async getUser() { calls.push("getUser"); return { data: { user }, error: null }; },
    },
  };
}

test("recovery fragment is validated and goes to password reset, not dashboard", async () => {
  const { auth, calls } = authFixture();
  assert.equal(await completeAuthLink(hash, "/dashboard", auth), "/reset-password?next=%2Fdashboard");
  assert.deepEqual(calls, ["setSession", "getUser"]);
  assert.equal(await completeAuthLink(hash, "/reset-password", auth), "/reset-password");
});

test("expired and missing links cannot reuse an existing signed-in session", async () => {
  for (const fragment of ["", "#access_token=test-access", `${hash}&error_code=otp_expired`, `${hash}&error=access_denied`]) {
    const { auth, calls } = authFixture();
    await assert.rejects(completeAuthLink(fragment, "/dashboard", auth), /invalid/);
    assert.deepEqual(calls, []);
  }
});

test("a failed session or failed user validation never opens password reset", async () => {
  const sessionFailure = authFixture(new Error("provider error"));
  await assert.rejects(completeAuthLink(hash, "/dashboard", sessionFailure.auth), /invalid/);
  assert.deepEqual(sessionFailure.calls, ["setSession"]);
  const userFailure = authFixture(null, null);
  await assert.rejects(completeAuthLink(hash, "/dashboard", userFailure.auth), /invalid/);
});

test("completion blocks external destinations and callback loops", async () => {
  const { auth } = authFixture();
  const signInHash = hash.replace("recovery", "invite");
  for (const next of ["https://evil.example", "//evil.example", "/auth-complete", "/auth/callback"]) {
    assert.equal(await completeAuthLink(signInHash, next, auth), "/dashboard");
  }
});
