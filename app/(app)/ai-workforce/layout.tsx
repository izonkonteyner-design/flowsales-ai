import { Settings, MessageSquare, Book, FileText, Activity } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Overview", href: "/ai-workforce", icon: Activity },
  { name: "Conversations", href: "/ai-workforce/conversations", icon: MessageSquare },
  { name: "Knowledge Base", href: "/ai-workforce/knowledge", icon: Book },
  { name: "Playbooks", href: "/ai-workforce/playbooks", icon: FileText },
  { name: "Settings", href: "/ai-workforce/settings", icon: Settings },
];

export default async function AiWorkforceLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-invoke-path") || "/ai-workforce";

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Sales Agent</h1>
          <p className="text-sm text-slate-500">
            Configure your AI employee, train it with your playbooks, and manage its conversations.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
        <aside className="lg:w-1/5">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
