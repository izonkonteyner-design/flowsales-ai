"use client";

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandSearchResult, CommandAction } from '@/lib/command-palette';

type CommandPaletteItem = (CommandAction & { _isAction: true; _index: number }) | (CommandSearchResult & { _isAction: false; _index: number });

interface CommandPaletteListProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  error: string | null;
  allItems: CommandPaletteItem[];
  selectedIndex: number;
  query: string;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}

const TYPE_ICONS = {
  lead: ({ className }: { className?: string }) => <svg className={cn('h-4 w-4', className)} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>,
  contact: ({ className }: { className?: string }) => <svg className={cn('h-4 w-4', className)} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><path d='M22 4L12 14.01l-3-3'/></svg>,
  quote: ({ className }: { className?: string }) => <svg className={cn('h-4 w-4', className)} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/><polyline points='10 9 9 9 8 9'/></svg>,
  task: ({ className }: { className?: string }) => <svg className={cn('h-4 w-4', className)} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='9 11 12 14 22 4'/><path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'/></svg>,
} as const;

const TYPE_LABELS = { lead: 'Lead', contact: 'Contact', quote: 'Quote', task: 'Task' } as const;

export function CommandPaletteList({
  listRef,
  isLoading,
  error,
  allItems,
  selectedIndex,
  query,
  onClose,
  router,
}: CommandPaletteListProps) {
  const actions = allItems.filter((i): i is CommandAction & { _isAction: true; _index: number } => i._isAction);
  const results = allItems.filter((i): i is CommandSearchResult & { _isAction: false; _index: number } => !i._isAction);

  if (isLoading) {
    return (
      <div ref={listRef} className='max-h-[500px] overflow-y-auto'>
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='h-6 w-6 animate-spin text-slate-400' />
          <span className='sr-only'>Searching...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={listRef} className='max-h-[500px] overflow-y-auto'>
        <div className='px-4 py-3 text-center text-sm text-red-600 dark:text-red-400'>{error}</div>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div ref={listRef} className='max-h-[500px] overflow-y-auto'>
        <div className='px-4 py-8 text-center text-slate-500 dark:text-slate-400'>
          {query ? 'No results found' : 'Start typing to search or choose an action'}
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className='max-h-[500px] overflow-y-auto' role='listbox' aria-label='Command palette results'>
      {query === '' && actions.length > 0 && (
        <div className='px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400 border-b border-slate-200 dark:border-white/10'>Actions</div>
      )}
      {results.length > 0 && (
        <div className='px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400 border-b border-slate-200 dark:border-white/10'>Results</div>
      )}
      {allItems.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isAction = item._isAction;
        const Icon = isAction
          ? ({ className }: { className?: string }) => <div className={cn('h-5 w-5 flex items-center justify-center', className)} />
          : TYPE_ICONS[item.type as keyof typeof TYPE_ICONS];

        const handleClick = () => {
          if (isAction) {
            if (item.href) router.push(item.href);
            else if (item.action) item.action();
          } else if (item.href) router.push(item.href);
          onClose();
        };

        const displayTitle = isAction ? item.label : item.title;
        const displaySubtitle = isAction ? item.description : item.subtitle;

        return (
          <button
            key={`${isAction ? "action" : "result"}-${item.id}`}
            type='button'
            role='option'
            aria-selected={isSelected}
            data-index={index}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
              isSelected ? 'bg-slate-100 dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
            )}
            onClick={handleClick}
          >
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10 flex-shrink-0'>
              <Icon className='h-4 w-4 text-slate-600 dark:text-slate-400' aria-hidden='true' />
            </div>
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-2'>
                <span className='font-medium text-slate-950 dark:text-white truncate'>{displayTitle}</span>
                {!isAction && (
                  <span className='px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'>
                    {TYPE_LABELS[item.type as keyof typeof TYPE_LABELS]}
                  </span>
                )}
              </div>
              <p className='text-sm text-slate-500 dark:text-slate-400 truncate'>{displaySubtitle}</p>
            </div>
            {isSelected && <svg className='h-5 w-5 text-slate-400 flex-shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='6 9 12 15 18 9'/></svg>}
          </button>
        );
      })}
    </div>
  );
}
