import { NextResponse } from "next/server";
import {
  listSocialMediaPosts,
  createSocialMediaPost,
  updateSocialMediaPost,
  publishSocialMediaPost,
} from "@/server/services/social-media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || undefined) as
    | "draft"
    | "scheduled"
    | "published"
    | "failed"
    | "archived"
    | undefined;
  const platform = (searchParams.get("platform") || undefined) as
    | "instagram"
    | "facebook"
    | "tiktok"
    | "youtube"
    | "google_business"
    | "linkedin"
    | "pinterest"
    | "threads"
    | "x"
    | "bluesky"
    | "mastodon"
    | undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

  const result = await listSocialMediaPosts({ status, platform, limit });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 500 });
  }
  return NextResponse.json({ posts: result.data });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createSocialMediaPost(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 400 });
    }
    return NextResponse.json({ post: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { postId, ...input } = body;
    if (!postId) {
      return NextResponse.json({ error: "postId gereklidir." }, { status: 400 });
    }

    // Dedicated publish action.
    if (input._action === "publish") {
      const result = await publishSocialMediaPost(postId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 400 });
      }
      return NextResponse.json({ post: result.data });
    }

    const result = await updateSocialMediaPost(postId, input);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 400 });
    }
    return NextResponse.json({ post: result.data });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
}
