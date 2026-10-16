import { NextResponse } from "next/server";
import { getProvider, isSocialMediaError } from "@/lib/social-media/registry";
import type { SocialPlatform } from "@/types/social-media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = (searchParams.get("platform") || "instagram") as SocialPlatform;
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state") || crypto.randomUUID();

  if (!redirectUri) {
    return NextResponse.json({ error: "redirect_uri is required." }, { status: 400 });
  }

  let provider;
  try {
    provider = getProvider(platform);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  let url;
  try {
    url = provider.authorizeUrl(state, redirectUri);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ authorizeUrl: url, state });
}
