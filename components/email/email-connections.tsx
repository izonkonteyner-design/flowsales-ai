"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, RefreshCw, Unplug } from "lucide-react";

import { getClientLocale, t, type Locale } from "@/lib/i18n";

type Connection = {
  id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  status: string;
  last_synced_at: string | null;
  error_message?: string | null;
};

export function EmailConnections({
  connections,
  canManage,
  gmailConfigured,
  microsoftConfigured,
  locale,
}: {
  connections: Connection[];
  canManage: boolean;
  gmailConfigured: boolean;
  microsoftConfigured: boolean;
  locale?: Locale;
}) {
  const activeLocale = locale ?? getClientLocale();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function disconnect(id: string) {
    if (!confirm(t(activeLocale, "emailDisconnectConfirm"))) return;
    setBusy(id);
    const response = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", connectionId: id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message);
      setBusy("");
      return;
    }
    window.location.reload();
  }

  const cards = [
    { provider: "gmail", label: "Gmail / Google Workspace", configured: gmailConfigured, color: "bg-red-500" },
    { provider: "microsoft", label: "Microsoft 365 / Outlook", configured: microsoftConfigured, color: "bg-blue-600" },
  ];

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      <div className="grid gap-5 md:grid-cols-2">
        {cards.map((card) => (
          <section
            key={card.provider}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950"
          >
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 place-items-center rounded-xl text-white ${card.color}`}>
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">{card.label}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t(activeLocale, "emailInboxSync")}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {connections
                .filter((item) => item.provider === card.provider)
                .map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {item.display_name || item.email_address}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.email_address}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {item.status === "connected" ? t(activeLocale, "emailConnected") : item.status}
                      </span>
                    </div>
                    {canManage ? (
                      <button
                        disabled={busy === item.id}
                        onClick={() => disconnect(item.id)}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                      >
                        <Unplug className="h-3.5 w-3.5" />
                        {t(activeLocale, "emailDisconnect")}
                      </button>
                    ) : null}
                  </div>
                ))}
              {canManage ? (
                card.configured ? (
                  <a
                    href={`/api/integrations/email/${card.provider}/connect`}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {connections.some((item) => item.provider === card.provider)
                      ? t(activeLocale, "emailConnectAnother")
                      : t(activeLocale, "emailConnectAccount")}
                  </a>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    {t(activeLocale, "emailProviderKeysRequired")}
                  </div>
                )
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t(activeLocale, "emailAdminOnly")}</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <Link
        href="/inbox/email"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
      >
        <Mail className="h-4 w-4" />
        {t(activeLocale, "openEmailCenter")}
      </Link>
    </div>
  );
}
