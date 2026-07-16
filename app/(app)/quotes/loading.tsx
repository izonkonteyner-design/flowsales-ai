import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function QuotesLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-4">
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
      </div>
      <LoadingSkeleton className="h-80 w-full" />
    </div>
  );
}
