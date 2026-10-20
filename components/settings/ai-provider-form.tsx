"use client";

import React, { useState } from "react";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Cpu, CheckCircle2, AlertCircle, RefreshCw, Server, Sparkles } from "lucide-react";
import { updateAiProviderSettingsAction, testAiConnectionAction } from "@/app/(app)/settings/actions";

export function AiProviderForm() {
  const [provider, setProvider] = useState<"gemini" | "ollama">("gemini");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3:latest");
  const [status, setStatus] = useState<{
    ok: boolean;
    message: string;
    loading: boolean;
  } | null>(null);

  const handleTestConnection = async () => {
    setStatus({ ok: false, message: "Bağlantı test ediliyor...", loading: true });
    try {
      const result = await testAiConnectionAction(provider, ollamaBaseUrl, ollamaModel);
      setStatus({
        ok: result.ok,
        message: result.message,
        loading: false,
      });
    } catch {
      setStatus({ ok: false, message: "Bağlantı testi sırasında bir hata oluştu.", loading: false });
    }
  };

  return (
    <SectionCard
      title="Yapay Zeka (AI) Sağlayıcı Ayarları"
      description="CRM asistanı, teklif taslağı üretimi ve lead skorlama için bulut (Gemini) veya yerel açık kaynak (Ollama) AI modelini seçin."
    >
      <form action={updateAiProviderSettingsAction} className="space-y-6">
        <input type="hidden" name="provider" value={provider} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setProvider("gemini")}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              provider === "gemini" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Google Gemini (Bulut)
              </div>
              {provider === "gemini" && <StatusBadge tone="success">Etkin</StatusBadge>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yüksek performanslı bulut AI modeli (gemini-3.5-flash-lite).
            </p>
          </div>

          <div
            onClick={() => setProvider("ollama")}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              provider === "ollama" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Server className="h-4 w-4 text-blue-500" />
                Ollama (Yerel / Açık Kaynak)
              </div>
              {provider === "ollama" && <StatusBadge tone="success">Etkin</StatusBadge>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sıfır API maliyetli, yerel sunucunuzda çalışan Llama 3 / Mistral modelleri.
            </p>
          </div>
        </div>

        {provider === "ollama" && (
          <div className="p-4 rounded-xl border bg-slate-50 dark:bg-white/5 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ollama Yapılandırma Bilgileri
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">Ollama Sunucu URL&apos;si</label>
                <input
                  type="text"
                  name="ollamaBaseUrl"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full mt-1 p-2 text-sm rounded-lg border bg-background"
                  placeholder="http://localhost:11434"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Model Adı</label>
                <input
                  type="text"
                  name="ollamaModel"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full mt-1 p-2 text-sm rounded-lg border bg-background"
                  placeholder="llama3:latest"
                />
              </div>
            </div>
          </div>
        )}

        {status && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              status.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
            }`}
          >
            {status.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={status?.loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border bg-background hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${status?.loading ? "animate-spin" : ""}`} />
            Bağlantıyı Test Et
          </button>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Cpu className="h-3.5 w-3.5" />
            Ayarları Kaydet
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
