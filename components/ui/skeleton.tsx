import { cn } from "@/lib/utils";

/** A grey block that stands in for content while it loads (a Suspense fallback). */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;

/** Cards in a grid, each a title line and a value. */
export const CardGridSkeleton = ({ count, className, cardClassName }: { count: number; className?: string; cardClassName?: string }) => (
  <div className={cn("grid grid-cols-1 gap-4", className)} role="status" aria-label="Loading">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={cn("space-y-3 rounded-xl border p-6", cardClassName)}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    ))}
  </div>
);

/** A page heading, a search box and a table. */
export const TableSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <div className="space-y-4" role="status" aria-label="Loading">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-28" />
    </div>
    <Skeleton className="h-px w-full" />
    <Skeleton className="h-9 w-full max-w-sm" />
    <div className="space-y-2 rounded-md border p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  </div>
);
