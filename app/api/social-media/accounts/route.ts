import { NextResponse } from "next/server";
import { listSocialMediaAccounts, connectSocialAccount } from "@/server/services/social-media";

export async function GET() {
  const result = await listSocialMediaAccounts();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 500 });
  }
  return NextResponse.json({ accounts: result.data });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await connectSocialAccount(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 400 });
    }
    return NextResponse.json({ account: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
}
