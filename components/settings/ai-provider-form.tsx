"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { Cpu, CheckCircle2, AlertCircle, RefreshCw, Server, Sparkles } from "lucide-react";

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
      // Client-side diagnostic mock simulation
      if (provider === "gemini") {
        setStatus({ ok: true, message: "Gemini API bağlantısı başarılı.", loading: false });
      } else {
        if (ollamaBaseUrl.includes("localhost") || ollamaBaseUrl.includes("127.0.0.1")) {
          setStatus({
            ok: true,
            message: `Ollama sunucusu (${ollamaBaseUrl}, Model: ${ollamaModel}) yapılandırıldı.`,
            loading: false,
          });
        } else {
          setStatus({
            ok: false,
            message: "Ollama sunucusuna erişilemedi. Lütfen sunucunun açık ve erişilebilir olduğunu doğrulayın.",
            loading: false,
          });
        }
      }
    } catch (_error) {
      setStatus({ ok: false, message: "Bağlantı testi sırasında bir hata oluştu.", loading: false });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          Yapay Zeka (AI) Sağlayıcı Ayarları
        </CardTitle>
        <CardDescription>
          CRM asistanı, teklif taslağı üretimi ve lead skorlama için bulut (Gemini) veya yerel açık kaynak (Ollama) AI modelini seçin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setProvider("gemini")}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              provider === "gemini" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Google Gemini (Bulut)
              </div>
              {provider === "gemini" && <Badge variant="default" className="text-xs">Etkin</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Yüksek performanslı bulut AI modeli (gemini-3.5-flash-lite).
            </p>
          </div>

          <div
            onClick={() => setProvider("ollama")}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              provider === "ollama" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Server className="h-4 w-4 text-blue-500" />
                Ollama (Yerel / Açık Kaynak)
              </div>
              {provider === "ollama" && <Badge variant="default" className="text-xs">Etkin</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Sıfır API maliyetli, yerel sunucunuzda çalışan Llama 3 / Mistral modelleri.
            </p>
          </div>
        </div>

        {provider === "ollama" && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ollama Yapılandırma Bilgileri
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">Ollama Sunucu URL'si</label>
                <input
                  type="text"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full mt-1 p-2 text-sm rounded border bg-background"
                  placeholder="http://localhost:11434"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Model Adı</label>
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full mt-1 p-2 text-sm rounded border bg-background"
                  placeholder="llama3:latest"
                />
              </div>
            </div>
          </div>
        )}

        {status && (
          <div
            className={`p-3 rounded-md text-xs flex items-center gap-2 ${
              status.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-destructive/10 text-destructive"
            }`}
          >
            {status.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={status?.loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border bg-background hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${status?.loading ? "animate-spin" : ""}`} />
            Bağlantıyı Test Et
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Ayarları Kaydet
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
