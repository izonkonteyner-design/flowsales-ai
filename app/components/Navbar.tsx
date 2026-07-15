import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />

        <input
          type="search"
          placeholder="Search leads, quotes, contacts..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-4 pl-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5 text-slate-600" />
        </Button>

        <div className="flex items-center gap-3 border-l border-slate-200 pl-3 sm:pl-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            FS
          </div>

          <span className="hidden text-sm font-medium text-slate-700 sm:block">
            FlowSales
          </span>
        </div>
      </div>
    </header>
  );
}
