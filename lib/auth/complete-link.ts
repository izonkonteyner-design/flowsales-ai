import { normalizeSafeRedirectPath } from "@/lib/validations/auth";

type LinkAuth = {
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>;
  getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>;
};

export const invalidAuthLinkMessage =
  "This link is invalid, has expired, or has already been used. Request a new link and open only the latest email.";

export async function completeAuthLink(hash: string, next: string, auth: LinkAuth) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (params.has("error") || params.has("error_code") || params.has("error_description") || !accessToken || !refreshToken) {
    throw new Error(invalidAuthLinkMessage);
  }

  const { error } = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw new Error(invalidAuthLinkMessage);
  // Validate against Auth; never trust claims decoded from the URL or an old session.
  const { data, error: userError } = await auth.getUser();
  if (userError || !data.user) throw new Error(invalidAuthLinkMessage);

  let target = normalizeSafeRedirectPath(next);
  if (target.startsWith("/auth-complete") || target.startsWith("/auth/callback")) target = "/dashboard";
  if (params.get("type") === "recovery" && target.split("?")[0] !== "/reset-password") {
    target = `/reset-password?next=${encodeURIComponent(target)}`;
  }
  return target;
}
