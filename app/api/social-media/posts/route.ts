import { socialPlatformSchema, socialPostStatusSchema } from "@/lib/social-media/validation";
import { isSameOriginSocialRequest } from "@/lib/social-media/request";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  listSocialMediaPosts,
  createSocialMediaPost,
  updateSocialMediaPost,
  publishSocialMediaPost,
} from "@/server/services/social-media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = z.object({
    status: socialPostStatusSchema.optional(),
    platform: socialPlatformSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(Object.fromEntries(searchParams));
  if (!filters.success) return NextResponse.json({ error: "Geçersiz gönderi filtresi." }, { status: 400 });
  const result = await listSocialMediaPosts(filters.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 500 });
  }
  return NextResponse.json({ posts: result.data });
}

export async function POST(request: Request) {
  if (!isSameOriginSocialRequest(request)) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
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
  if (!isSameOriginSocialRequest(request)) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  try {
    const body = await request.json();
    const { postId, ...input } = body;
    if (!z.uuid().safeParse(postId).success) {
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
