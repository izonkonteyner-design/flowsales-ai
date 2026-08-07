import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Temporary preview-only presence diagnostics. Never logs secret values.
if (process.env.VERCEL === "1") {
  const present = (value: string | undefined) => Boolean(value?.trim());
  console.log("[meta-env-diagnostics]", JSON.stringify({
    META_APP_ID: present(process.env.META_APP_ID),
    META_CLIENT_ID: present(process.env.META_CLIENT_ID),
    META_APP_SECRET: present(process.env.META_APP_SECRET),
    META_CLIENT_SECRET: present(process.env.META_CLIENT_SECRET),
    NEXT_PUBLIC_SITE_URL: present(process.env.NEXT_PUBLIC_SITE_URL),
    TOKEN_ENCRYPTION_KEY: present(process.env.TOKEN_ENCRYPTION_KEY),
    META_WEBHOOK_VERIFY_TOKEN: present(process.env.META_WEBHOOK_VERIFY_TOKEN),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: present(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    META_EMBEDDED_SIGNUP_CONFIG_ID: present(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID),
  }));
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: process.env.SENTRY_ORG || "flowsales",
  project: process.env.SENTRY_PROJECT || "flowsales-ai",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
