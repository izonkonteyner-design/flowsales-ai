import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthRedirectPath,
  createAuthActionState,
  flattenAuthValidationError,
  mapAuthProviderError,
} from "@/server/services/auth-domain";
import {
  bootstrapWorkspaceFormSchema,
  forgotPasswordFormSchema,
  loginFormSchema,
  registerFormSchema,
  resetPasswordFormSchema,
  normalizeSafeRedirectPath,
} from "@/lib/validations/auth";

test("auth login validation normalizes email and redirect path", () => {
  const parsed = loginFormSchema.parse({
    email: "  Selin@Example.com ",
    password: "Password123!",
    next: " /dashboard ",
  });

  assert.equal(parsed.email, "selin@example.com");
  assert.equal(parsed.next, "/dashboard");
});

test("auth register validation enforces matching passwords", () => {
  assert.equal(
    registerFormSchema.safeParse({
      full_name: "Selin Kaya",
      email: "selin@example.com",
      password: "Password123!",
      confirm_password: "Password1234!",
      workspace_name: "FlowSales AI",
      next: "/dashboard",
    }).success,
    false,
  );
});

test("auth bootstrap validation trims workspace names", () => {
  const parsed = bootstrapWorkspaceFormSchema.parse({
    full_name: "  Selin Kaya ",
    workspace_name: "  FlowSales AI  ",
    next: "/dashboard",
  });

  assert.equal(parsed.full_name, "Selin Kaya");
  assert.equal(parsed.workspace_name, "FlowSales AI");
});

test("auth password reset schemas reject invalid confirmation", () => {
  assert.equal(
    forgotPasswordFormSchema.parse({
      email: "team@flowsales.ai",
      next: "/login",
    }).email,
    "team@flowsales.ai",
  );

  assert.equal(
    resetPasswordFormSchema.safeParse({
      new_password: "Password123!",
      confirm_password: "Password1234!",
      next: "/dashboard",
    }).success,
    false,
  );
});

test("auth provider errors are mapped to safe messages", () => {
  assert.match(mapAuthProviderError(new Error("Invalid login credentials"), "Fallback"), /Invalid email or password/i);
  assert.match(mapAuthProviderError(new Error("User already exists"), "Fallback"), /already exists/i);
});

test("auth redirect helpers block unsafe targets", () => {
  assert.equal(normalizeSafeRedirectPath("https://example.com", "/dashboard"), "/dashboard");
  assert.equal(buildAuthRedirectPath("//example.com", "/dashboard"), "/dashboard");
});

test("auth action state helper preserves message and success flags", () => {
  const state = createAuthActionState("Done", { email: "Email is required." }, true);

  assert.equal(state.success, true);
  assert.equal(state.message, "Done");
  assert.equal(state.fieldErrors.email, "Email is required.");
});

test("auth validation flattening keeps field errors", () => {
  const parsed = loginFormSchema.safeParse({
    email: "",
    password: "",
    next: "/dashboard",
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const flattened = flattenAuthValidationError(parsed.error);
    assert.ok(flattened.email);
    assert.ok(flattened.password);
  }
});
