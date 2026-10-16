import { NextResponse } from "next/server";
import { isSameOriginSocialRequest } from "@/lib/social-media/request";
import { MAX_SOCIAL_MEDIA_BYTES } from "@/lib/social-media/media-validation";
import { uploadSocialMedia } from "@/server/services/social-media-library";

export async function POST(request: Request) {
  if (!isSameOriginSocialRequest(request)) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_SOCIAL_MEDIA_BYTES + 64_000) return NextResponse.json({ error: "Dosya boyutu doğrulanamadı veya 10 MB sınırı aşıldı." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya seçin." }, { status: 400 });
    await uploadSocialMedia(file);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Yükleme başarısız." }, { status: 400 }); }
}
