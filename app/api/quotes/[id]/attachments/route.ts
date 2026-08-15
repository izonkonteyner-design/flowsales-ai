import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "attachment";
}

function attachmentKind(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "document";
  if (type.includes("word") || type === "text/plain") return "technical";
  return "other";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: quoteId } = await params;
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, organization_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("organization_id", quote.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "admin", "sales"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File must be between 1 byte and 10 MB" }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

  const path = `organizations/${quote.organization_id}/quotes/${quoteId}/attachments/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("quote-attachments").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: "Unable to store attachment" }, { status: 500 });

  const { data: attachment, error: insertError } = await supabase
    .from("quote_attachments")
    .insert({
      organization_id: quote.organization_id,
      quote_id: quoteId,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      kind: attachmentKind(file.type),
      created_by: user.id,
    })
    .select("id, file_name, mime_type, file_size_bytes, kind, created_at")
    .single();

  if (insertError) {
    await supabase.storage.from("quote-attachments").remove([path]);
    return NextResponse.json({ error: "Unable to save attachment metadata" }, { status: 500 });
  }
  return NextResponse.json({ attachment }, { status: 201 });
}
