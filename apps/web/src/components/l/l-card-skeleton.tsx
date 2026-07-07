import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function LCardSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2.5 px-5 pt-4">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="ml-auto h-5 w-16 rounded-md" />
      </div>
      <div className="px-5 pt-3 pb-4">
        <Skeleton className="h-5 w-3/4" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
      <div className="border-t px-5 py-2.5">
        <Skeleton className="h-4 w-40" />
      </div>
    </Card>
  );
}
