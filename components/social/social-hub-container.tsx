"use client";

import React, { useState } from "react";
import { Share2, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type SocialHubContainerProps = {
  mediaContent?: React.ReactNode;
  socialContent: React.ReactNode;
  adsContent: React.ReactNode;
  analyticsContent?: React.ReactNode;
};

export function SocialHubContainer({
  socialContent,
  adsContent,
  analyticsContent,
}: SocialHubContainerProps) {
  const [activeTab, setActiveTab] = useState<"social" | "ads" | "analytics">("social");

  return (
    <div className="space-y-5">
      {/* Top Tab Switcher */}
      <div className="flex border-b border-border gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("social")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "social"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>İçerik Yayını & Planlama</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ads")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "ads"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Reklam Yönetimi (Google & Meta)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer shrink-0",
            activeTab === "analytics"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Pazarlama Analitiği</span>
        </button>
      </div>

      {/* Active Tab Views */}
      <div>
        {activeTab === "social" && socialContent}
        {activeTab === "ads" && adsContent}
        {activeTab === "analytics" && analyticsContent}
      </div>
    </div>
  );
}
