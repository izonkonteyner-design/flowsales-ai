"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialMediaAccount } from "@/types/social-media";

function isFutureSchedule(value: string) {
  return Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}

export function CreatePostForm({ disabled, accounts = [] }: { disabled: boolean; accounts?: SocialMediaAccount[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const connected = accounts.filter(a => a.status === "connected");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const account = connected.find(a => a.id === fields.get("account_id"));
    if (!account) { setMessage("Bağlı bir hesap seçin."); return; }
    const date = String(fields.get("scheduled_at") || "");
    if (date && !isFutureSchedule(date)) { setMessage("Yayın tarihi gelecekte olmalıdır."); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/social-media/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: account.id, platform: account.platform, content: String(fields.get("content") || "").trim(), status: date ? "scheduled" : "draft", scheduled_at: date ? new Date(date).toISOString() : null, media_urls: String(fields.get("media_urls") || "").split(/[\n,]/).map(s => s.trim()).filter(Boolean) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gönderi oluşturulamadı.");
      form.reset(); setMessage(date ? "Gönderi yayın kuyruğuna eklendi." : "Taslak kaydedildi. Henüz yayımlanmadı."); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Gönderi oluşturulamadı."); }
    finally { setPending(false); }
  }
  const input = "mt-2 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm disabled:opacity-40";
  return <form onSubmit={submit}><fieldset disabled={disabled || pending || !connected.length} className="space-y-4">
    <label className="block text-sm">Yayın hesabı<select name="account_id" required className={input} defaultValue=""><option value="" disabled>Hesap seçin</option>{connected.map(a => <option key={a.id} value={a.id}>{a.username || a.platform_account_id} · {a.platform}</option>)}</select></label>
    <label className="block text-sm">Gönderi metni<textarea name="content" required minLength={1} maxLength={2200} rows={4} className={input} /></label>
    <label className="block text-sm">HTTPS medya bağlantıları<textarea name="media_urls" rows={2} className={input} placeholder="Her satıra bir herkese açık HTTPS görsel veya video bağlantısı" /></label>
    <label className="block text-sm">Yayın zamanı (boş bırakılırsa taslak)<input name="scheduled_at" type="datetime-local" className={input} /></label>
    <p className="text-xs text-slate-400">Girdiğiniz zaman cihazınızın saat diliminden UTC’ye çevrilir. Taslak kaydetmek yayın yapmaz; tarih seçerseniz belirtilen zamanda yayınlanır.</p>
    <button disabled={disabled || pending || !connected.length} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium disabled:opacity-40">{pending ? "Kaydediliyor…" : "Taslak kaydet / yayın planla"}</button>
  </fieldset>{!connected.length ? <p className="mt-3 text-sm text-amber-300">Gönderi oluşturmak için önce bir yayın hesabı bağlanmalıdır.</p> : null}{message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}</form>;
}
