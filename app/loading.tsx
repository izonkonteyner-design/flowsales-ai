import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <LoadingSkeleton className="h-8 w-48" />
      <LoadingSkeleton className="h-5 w-80" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
      </div>
    </div>
  );
}
