import { NextResponse } from "next/server";
import { runPublishQueue } from "@/server/services/social-media-publish";

/**
 * Protected cron endpoint for scheduled social media publishing.
 *
 * Security:
 *  * Requires `Authorization: Bearer <CRON_SECRET>` header matching the
 *    CRON_SECRET environment variable. Without it, returns 401.
 *  * POST only. Runs the publish queue and returns a summary.
 *
 * Note: On free/limited hosting plans, cron frequency may be restricted.
 * Configure your platform's cron to hit this endpoint at an interval that
 * respects your plan's limits (e.g., every 15-60 minutes).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runPublishQueue();
    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
