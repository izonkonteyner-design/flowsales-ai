import type { Metadata } from "next";
import { AuthLinkCompletion } from "@/components/auth/auth-link-completion";
import { normalizeSafeRedirectPath } from "@/lib/validations/auth";

export const metadata: Metadata = {
  title: "Verify account link",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function AuthCompletePage({ searchParams }: {
  searchParams: Promise<{ next?: string; invalid?: string }>;
}) {
  const params = await searchParams;
  return <AuthLinkCompletion next={normalizeSafeRedirectPath(params.next)} invalid={params.invalid === "1"} />;
}
