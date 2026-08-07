import { NextRequest } from "next/server";
export async function GET(request: NextRequest) {
  const target = new URL("/api/integrations/meta/connect", request.url);
  target.searchParams.set("provider", "instagram");
  target.searchParams.set("return_path", request.nextUrl.searchParams.get("return_path") || "/settings/integrations");
  return Response.redirect(target, 307);
}
