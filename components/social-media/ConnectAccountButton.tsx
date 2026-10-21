"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPlatform } from "@/types/social-media";

export function ConnectAccountButton({ platform, disabled }: { platform: SocialPlatform; disabled?: boolean }) {
  const classes = "inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40";
  return disabled ? <button disabled className={classes}>Bağlantı kullanılamıyor</button> : <a className={classes} href={`/api/social-media/authorize?platform=${platform}`}>Hesap bağla</a>;
}

export function DisconnectAccountButton({ accountId, disabled }: { accountId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function disconnect() {
    if (disabled || pending || !window.confirm("Hesabın FlowSales bağlantısı kesilsin mi? Planlı yayınlar bu hesapla gönderilemez.")) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/social-media/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", accountId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bağlantı kesilemedi.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Bağlantı kesilemedi."); }
    finally { setPending(false); }
  }
  return <div><button onClick={disconnect} disabled={disabled || pending} className="rounded-xl border border-white/15 px-3 py-2 text-sm disabled:opacity-40">{pending ? "İşleniyor…" : "Bağlantıyı kes"}</button>{error ? <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p> : null}</div>;
}
