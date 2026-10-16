import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CommandSearchResult, CommandAction } from "@/lib/command-palette";
import { CommandPaletteList } from "./CommandPaletteList";

function debounce(fn: (arg: string) => void, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (arg: string) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(arg), ms);
  };
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions?: CommandAction[];
}

type CommandPaletteItem = (CommandAction & { _isAction: true; _index: number }) | (CommandSearchResult & { _isAction: false; _index: number });

export function CommandPalette({ isOpen, onClose, actions = [] }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allItems = useMemo<CommandPaletteItem[]>(() => [
    ...(query ? [] : actions.map((a, i) => ({ ...a, _isAction: true as const, _index: i }))),
    ...results.map((r, i) => ({ ...r, _isAction: false as const, _index: i }))
  ], [query, actions, results]);

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) { setResults([]); return; }
    setIsLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ q: searchQuery, limit: "10" });
      const response = await fetch(`/api/command-palette?${params}`);
      if (response.ok) { const data = await response.json(); setResults(data.results || []); }
      else { setError("Search failed"); setResults([]); }
    } catch { setError("Search failed"); setResults([]); }
    finally { setIsLoading(false); }
  }, []);

  const searchDebounced = useMemo(() => debounce(doSearch, 150), [doSearch]);

  useEffect(() => {
    if (isOpen) { setQuery(""); setResults([]); setSelectedIndex(0); setError(null); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [isOpen]);

  useEffect(() => { searchDebounced(query); }, [query, searchDebounced]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((prev) => Math.max(prev - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); const item = allItems[selectedIndex]; if (item) { if (item._isAction) { if (item.href) router.push(item.href); else if (item.action) item.action(); } else if (item.href) router.push(item.href); onClose(); } return; }
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onClose(); return; }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, allItems, selectedIndex, onClose, router]);

  useEffect(() => { const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`); el?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setSelectedIndex(0); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative pointer-events-auto w-full max-w-2xl mx-4 rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 dark:shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <Search className="h-5 w-5 text-slate-400 flex-shrink-0" aria-hidden="true" />
          <input ref={inputRef} type="text" value={query} onChange={handleInputChange} placeholder="Type a command or search..." className="flex-1 bg-transparent border-0 focus:ring-0 text-lg" aria-label="Command palette search" autoComplete="off" spellCheck={false} />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-500 bg-slate-100 dark:bg-white/10 dark:text-slate-400"><span>⌘</span>K</kbd>
          <button type="button" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10" onClick={onClose} aria-label="Close command palette"><X className="h-5 w-5" /></button>
        </div>
        <CommandPaletteList listRef={listRef} isLoading={isLoading} error={error} allItems={allItems} selectedIndex={selectedIndex} query={query} onClose={onClose} router={router} />
        <div className="px-4 py-2 border-t border-slate-200 dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">↓</kbd> navigate •
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">Enter</kbd> select •
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">Esc</kbd> close
          </p>
        </div>
      </div>
    </div>
  );
}