export function getTikTokLoginScopes(): string[] {
  const scopes = (process.env.TIKTOK_SCOPES || "user.info.basic")
    .split(",").map((scope) => scope.trim()).filter(Boolean);
  return [...new Set(["user.info.basic", ...scopes])];
}

export type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  open_id?: string;
  error?: string;
  error_description?: string;
};
