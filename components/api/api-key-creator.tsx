"use client";

import { useActionState } from "react";

import { createApiKeyAction, type ApiKeyActionState } from "@/app/(app)/api-layer/actions";
import { Input } from "@/components/ui/input";

const initialState: ApiKeyActionState = { ok: false, message: "" };

export function ApiKeyCreator() {
  const [state, action, pending] = useActionState(createApiKeyAction, initialState);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <Input name="name" required minLength={2} placeholder="Örn. ERP entegrasyonu" />
        <button
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          {pending ? "Oluşturuluyor..." : "API anahtarı oluştur"}
        </button>
      </form>
      {state.message ? <p className={`text-sm ${state.ok ? "text-emerald-400" : "text-rose-400"}`}>{state.message}</p> : null}
      {state.secret ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-200">Yalnızca bir kez gösterilir</p>
          <code className="mt-2 block break-all text-sm font-mono text-slate-900 dark:text-white">{state.secret}</code>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Bu anahtarın yalnız SHA-256 özeti saklanır; kaybolursa yeni anahtar oluşturun.</p>
        </div>
      ) : null}
    </div>
  );
}
