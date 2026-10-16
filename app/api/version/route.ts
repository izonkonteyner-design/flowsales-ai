import { NextResponse } from "next/server";
import { releaseInfo } from "@/lib/release-info";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(releaseInfo(process.env), { headers: { "Cache-Control": "no-store" } });
}
