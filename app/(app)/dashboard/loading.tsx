import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton className="h-24 w-full" />
      <LoadingSkeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
      </div>
      <LoadingSkeleton className="h-40 w-full" />
      <div className="grid gap-6 xl:grid-cols-2">
        <LoadingSkeleton className="h-96 w-full" />
        <LoadingSkeleton className="h-96 w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <LoadingSkeleton className="h-96 w-full" />
        <LoadingSkeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

