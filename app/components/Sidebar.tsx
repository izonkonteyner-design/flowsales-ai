import Link from "next/link";
import {
  Bot,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Leads",
    href: "/leads",
    icon: Users,
  },
  {
    title: "Quotes",
    href: "/quotes",
    icon: FileText,
  },
  {
    title: "AI Assistant",
    href: "/ai",
    icon: Bot,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r bg-white">
      <div className="border-b px-6 py-5">
        <Link href="/dashboard" className="text-xl font-bold">
          FlowSales AI
        </Link>

        <p className="mt-1 text-sm text-muted-foreground">
          Your AI Sales Employee
        </p>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <Icon className="h-5 w-5" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="rounded-xl bg-slate-100 p-4">
          <p className="text-sm font-semibold">FlowSales AI</p>

          <p className="mt-1 text-xs text-slate-500">
            Starter workspace
          </p>
        </div>
      </div>
    </aside>
  );
}