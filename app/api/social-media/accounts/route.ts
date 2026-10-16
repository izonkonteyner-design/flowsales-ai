import { NextResponse } from "next/server";
import { z } from "zod";
import { listSocialMediaAccounts, disconnectSocialAccount } from "@/server/services/social-media";
import { isSameOriginSocialRequest } from "@/lib/social-media/request";

export async function GET() {
  const result = await listSocialMediaAccounts();
  return result.ok ? NextResponse.json({ accounts: result.data }) : NextResponse.json({ error: result.error }, { status: result.statusCode ?? 500 });
}
export async function POST(request: Request) {
  if (!isSameOriginSocialRequest(request)) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  try {
    const input = z.object({ action: z.literal("disconnect"), accountId: z.uuid() }).parse(await request.json());
    const result = await disconnectSocialAccount(input.accountId);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.statusCode ?? 400 });
  } catch { return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 }); }
}
