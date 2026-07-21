export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="h-10 w-72 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {['lead-skel-1', 'lead-skel-2', 'lead-skel-3', 'lead-skel-4'].map((id) => (
          <div key={id} className="h-28 animate-pulse rounded-3xl bg-slate-200 dark:bg-white/10" />
        ))}
      </div>

      <div className="h-[32rem] animate-pulse rounded-3xl bg-slate-200 dark:bg-white/10" />
    </div>
  );
}
