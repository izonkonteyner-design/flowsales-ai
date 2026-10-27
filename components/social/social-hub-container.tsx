"use client";

import React, { useState } from "react";
import { Share2, TrendingUp, Sparkles, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type SocialHubContainerProps = {
  mediaContent?: React.ReactNode;
  socialContent: React.ReactNode;
  adsContent: React.ReactNode;
  creativeContent: React.ReactNode;
  analyticsContent?: React.ReactNode;
};

export function SocialHubContainer({
  socialContent,
  adsContent,
  creativeContent,
  analyticsContent,
}: SocialHubContainerProps) {
  const [activeTab, setActiveTab] = useState<"social" | "ads" | "creative" | "analytics">("social");

  return (
    <div className="space-y-6">
      {/* Top Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-white/10 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("social")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "social"
              ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          <Share2 className="h-4 w-4" />
          <span>İçerik Yayını & Kategori Stüdyosu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ads")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "ads"
              ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Reklam Yönetimi (Google & Meta Ads)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("creative")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "creative"
              ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>Kreatif Prodüksiyon Stüdyosu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "analytics"
              ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Performans & Optimizasyon</span>
        </button>
      </div>

      {/* Active Tab Views */}
      {activeTab === "social" && socialContent}
      {activeTab === "ads" && adsContent}
      {activeTab === "creative" && creativeContent}
      {activeTab === "analytics" && analyticsContent}
    </div>
  );
}
