import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL("/api/integrations/meta/connect", request.url);
  url.searchParams.set("provider", "instagram");
  url.searchParams.set("return_path", "/settings/integrations");
  return NextResponse.redirect(url);
}
