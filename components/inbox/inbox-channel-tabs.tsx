"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { href: "/inbox", label: "Mesajlar", icon: MessageSquare },
  { href: "/inbox/phone", label: "Telefon", icon: Phone },
  { href: "/inbox/email", label: "E-posta", icon: Mail },
] as const;

export function InboxChannelTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-white/10 dark:bg-slate-950/60">
      {CHANNELS.map((channel) => {
        const active = pathname === channel.href || (channel.href === "/inbox" && pathname.startsWith("/inbox/") && !pathname.startsWith("/inbox/phone") && !pathname.startsWith("/inbox/email"));
        const Icon = channel.icon;
        return (
          <Link
            key={channel.href}
            href={channel.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" />
            {channel.label}
          </Link>
        );
      })}
    </div>
  );
}
