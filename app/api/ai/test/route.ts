import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        message: "AI connection testing is disabled in production.",
      },
      { status: 404 },
    );
  }

  try {
    const { generateText } = await import("@/server/services/ai");
    const responseText = await generateText("Reply only with:\nGemini connection successful");
    const message = responseText.trim();

    if (message !== "Gemini connection successful") {
      throw new Error("Gemini test response was unexpected.");
    }

    return NextResponse.json({
      success: true,
      message,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Unable to connect to Gemini.",
      },
      { status: 500 },
    );
  }
}
