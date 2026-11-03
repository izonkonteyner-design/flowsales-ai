import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function AppSegmentLoading() {
  return (
    <div className="space-y-5 animate-in fade-in duration-150" aria-busy="true">
      {/* Page Header Skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-2">
        <LoadingSkeleton className="h-3 w-24 rounded" />
        <LoadingSkeleton className="h-6 w-56 rounded" />
        <LoadingSkeleton className="h-4 w-96 max-w-full rounded" />
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <LoadingSkeleton className="h-3 w-28 rounded" />
            <LoadingSkeleton className="h-8 w-8 rounded-lg" />
          </div>
          <LoadingSkeleton className="h-7 w-20 rounded" />
          <LoadingSkeleton className="h-3 w-36 rounded" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <LoadingSkeleton className="h-3 w-28 rounded" />
            <LoadingSkeleton className="h-8 w-8 rounded-lg" />
          </div>
          <LoadingSkeleton className="h-7 w-20 rounded" />
          <LoadingSkeleton className="h-3 w-36 rounded" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <LoadingSkeleton className="h-3 w-28 rounded" />
            <LoadingSkeleton className="h-8 w-8 rounded-lg" />
          </div>
          <LoadingSkeleton className="h-7 w-20 rounded" />
          <LoadingSkeleton className="h-3 w-36 rounded" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <LoadingSkeleton className="h-3 w-28 rounded" />
            <LoadingSkeleton className="h-8 w-8 rounded-lg" />
          </div>
          <LoadingSkeleton className="h-7 w-20 rounded" />
          <LoadingSkeleton className="h-3 w-36 rounded" />
        </div>
      </div>

      {/* Main Content / Table Skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex justify-between items-center border-b border-border pb-3">
          <LoadingSkeleton className="h-4 w-40 rounded" />
          <LoadingSkeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="space-y-2.5">
          <LoadingSkeleton className="h-10 w-full rounded-md" />
          <LoadingSkeleton className="h-10 w-full rounded-md" />
          <LoadingSkeleton className="h-10 w-full rounded-md" />
          <LoadingSkeleton className="h-10 w-full rounded-md" />
          <LoadingSkeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
