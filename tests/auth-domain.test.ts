import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthRedirectPath,
  createAuthActionState,
  flattenAuthValidationError,
  mapAuthProviderError,
} from "@/server/services/auth-domain";
import { getSupabaseOrigin } from "@/server/services/auth";
import { getSiteUrl } from "@/server/env";
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

test("auth origin resolves site URL fallbacks in the documented order", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalProjectUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  const originalVercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  const originalRootVercelUrl = process.env.VERCEL_URL;

  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL = "project.example";
    process.env.NEXT_PUBLIC_VERCEL_URL = "https://preview.example";
    process.env.VERCEL_URL = "root.example";

    assert.equal(getSiteUrl(), "https://site.example");
    assert.equal(getSupabaseOrigin(), "https://site.example");

    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(getSiteUrl(), "https://app.example");

    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(getSiteUrl(), "https://project.example");

    delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
    assert.equal(getSiteUrl(), "https://preview.example");

    delete process.env.NEXT_PUBLIC_VERCEL_URL;
    assert.equal(getSiteUrl(), "https://root.example");

    delete process.env.VERCEL_URL;
    assert.equal(getSiteUrl(), "http://localhost:3000");
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }

    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }

    if (originalProjectUrl === undefined) {
      delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
    } else {
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL = originalProjectUrl;
    }

    if (originalVercelUrl === undefined) {
      delete process.env.NEXT_PUBLIC_VERCEL_URL;
    } else {
      process.env.NEXT_PUBLIC_VERCEL_URL = originalVercelUrl;
    }

    if (originalRootVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalRootVercelUrl;
    }
  }
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
