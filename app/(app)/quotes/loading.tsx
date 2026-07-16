import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { SectionCard } from "@/components/shared/section-card";

export default function QuotesLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton className="h-28 w-full rounded-[2rem]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton className="h-28 rounded-3xl" />
        <LoadingSkeleton className="h-28 rounded-3xl" />
        <LoadingSkeleton className="h-28 rounded-3xl" />
        <LoadingSkeleton className="h-28 rounded-3xl" />
      </div>
      <SectionCard>
        <LoadingSkeleton className="h-12 w-full rounded-2xl" />
        <div className="mt-4 space-y-3">
          <LoadingSkeleton className="h-20 w-full rounded-3xl" />
          <LoadingSkeleton className="h-20 w-full rounded-3xl" />
          <LoadingSkeleton className="h-20 w-full rounded-3xl" />
        </div>
      </SectionCard>
    </div>
  );
}
