"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Paperclip, Trash2, Upload } from "lucide-react";

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  kind: string;
  created_at: string;
  url?: string | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuoteAttachmentsPanel({ quoteId, canMutate }: { quoteId?: string | null; canMutate: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!quoteId) return;
    const response = await fetch(`/api/quotes/${quoteId}/attachments`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Ek dosyalar yüklenemedi.");
    setAttachments(data.attachments ?? []);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ek dosyalar yüklenemedi."));
  }, [quoteId]);

  async function upload(file: File) {
    if (!quoteId) return;
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setError("Dosya boyutu 10 MB veya daha küçük olmalıdır.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/quotes/${quoteId}/attachments`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Dosya yüklenemedi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!quoteId || !window.confirm("Bu eki silmek istediğinize emin misiniz?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/attachments`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachment_id: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Ek silinemedi.");
      setAttachments((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ek silinemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (!quoteId) {
    return <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">Teklifi kaydettikten sonra dosya ekleyebilirsiniz.</div>;
  }

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">Teklif Ekleri</h3>
          <p className="mt-1 text-sm text-slate-500">Logo, ürün görseli, katalog, teknik belge veya PDF ekleyin. Maksimum 10 MB.</p>
        </div>
        {canMutate ? (
          <>
            <input ref={inputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <Upload className="h-4 w-4" /> {busy ? "İşleniyor…" : "Dosya ekle"}
            </button>
          </>
        ) : null}
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div> : null}

      {attachments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/10">Henüz ek dosya yok.</div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex min-w-0 items-center gap-3">
                <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{attachment.file_name}</p>
                  <p className="text-xs text-slate-500">{formatSize(attachment.file_size_bytes)} · {attachment.kind}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><ExternalLink className="h-3.5 w-3.5" /> Aç</a> : null}
                {canMutate ? <button type="button" onClick={() => void remove(attachment.id)} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/20 dark:bg-white/5 dark:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Sil</button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
