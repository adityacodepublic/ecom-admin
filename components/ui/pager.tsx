import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Page 2 of 5" with Previous / Next. `page` counts from 1. Shows nothing for a single page unless `always`. */
export const Pager = ({
  page,
  pages,
  onPage,
  summary,
  always,
  className,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  summary?: React.ReactNode;
  always?: boolean;
  className?: string;
}) => {
  if (pages <= 1 && !always) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-sm", className)}>
      <span className="text-muted-foreground">{summary}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <span>
          Page {page} of {Math.max(1, pages)}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
