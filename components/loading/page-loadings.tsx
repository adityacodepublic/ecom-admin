import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading blocks shared by the store admin's pages. Each stands for one element of the real page and copies the
 * wrapper classes of the page it loads, so the blocks sit where the real content will. Plain pulsing blocks
 * only, no details inside. No "use client": loading.tsx files and Suspense fallbacks (server) both use them.
 */

/** The page's frame (the same wrapper as every page). `fluid` = 16px side padding on phones (lists, dashboard, orders, settings); else 32px. */
export const PageFrame = ({ fluid = false, children }: { fluid?: boolean; children: React.ReactNode }) => (
  <div className="flex-col" role="status" aria-label="Loading">
    <div className={cn("flex-1 space-y-4", fluid ? "p-4 pt-6 md:p-8" : "p-8 pt-6")}>{children}</div>
  </div>
);

/**
 * The page heading (components/ui/heading.tsx): a title line and a description line, with an optional button
 * beside them. The blocks are a little smaller than the lines they stand for, so the two do not touch.
 * `descW`: the description's width classes (leave out when the heading has none). `wrapDesc`: the description
 * is long enough to wrap to two lines on phones (most are).
 */
export const HeadingLoading = ({
  titleW = "w-44",
  descW,
  wrapDesc = true,
  action,
  className = "flex items-center justify-between",
}: {
  titleW?: string;
  descW?: string;
  wrapDesc?: boolean;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div className={action ? className : undefined}>
    <div>
      <div className="py-1">
        <Skeleton className={cn("h-7", titleW)} />
      </div>
      {descW && (
        <div className="py-0.5">
          <Skeleton className={cn(wrapDesc ? "h-9 sm:h-4" : "h-4", descW)} />
        </div>
      )}
    </div>
    {action}
  </div>
);

/** A text button, 40px high ("Add New"). */
export const ButtonLoading = ({ className = "w-[117px]" }: { className?: string }) => <Skeleton className={cn("h-10", className)} />;
/** The icon button beside a form's title (delete). */
export const IconButtonLoading = () => <Skeleton className="h-9 w-10" />;

/** The line under the heading: the real separator. */
export const SeparatorLoading = ({ className }: { className?: string }) => <Separator className={className} />;

/** A table (components/ui/data-table.tsx): the search box, the header and `rows` rows in one block, and the pager. */
export const TableLoading = ({ rows = 10, rowHeight = 65, search = true, pager = false }: { rows?: number; rowHeight?: number; search?: boolean; pager?: boolean }) => (
  <div className="space-y-3">
    {search && <Skeleton className="h-10 w-full max-w-sm" />}
    <Skeleton style={{ height: 40 + rows * rowHeight }} />
    {pager && (
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[275px]" />
      </div>
    )}
  </div>
);

/** A form's save button, 126px wide. */
export const SaveButtonLoading = () => <Skeleton className="h-10 w-[126px]" />;
