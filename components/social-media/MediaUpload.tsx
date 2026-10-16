"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function MediaUpload({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled || pending) return;
    const form = event.currentTarget;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/social-media/media", { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Yükleme başarısız.");
      form.reset(); setMessage("Dosya özel çalışma alanı depolamasına yüklendi."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Yükleme başarısız."); }
    finally { setPending(false); }
  }
  return <form onSubmit={upload} className="space-y-3"><label className="block text-sm">Görsel veya video<input name="file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4" required disabled={disabled || pending} className="mt-2 block w-full rounded-xl border border-white/15 p-3 disabled:opacity-40" /></label><p className="text-xs text-slate-400">PNG, JPEG, WebP veya MP4 · En fazla 10 MB. Dosyalar özel depolamada saklanır. Önizleme bağlantıları 1 saat geçerlidir.</p><button disabled={disabled || pending} className="rounded-xl bg-violet-600 px-4 py-2 text-sm disabled:opacity-40">{pending ? "Yükleniyor…" : "Dosya yükle"}</button>{message ? <p role="status" className="text-sm">{message}</p> : null}</form>;
}
