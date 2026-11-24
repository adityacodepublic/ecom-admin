import { INSIGHT_CARDS_GRID, INSIGHT_NUMBERS_GRID, orderNumbersGrid, PAIR_GRID, THREE_GRID } from "@/lib/dashboard-grids";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { HeadingLoading, PageFrame, SeparatorLoading } from "./page-loadings";

/**
 * The dashboard's loading blocks: one block per card, in the same grids as the real cards (lib/dashboard-grids.ts).
 * Each part of the page has its own fallback (the page streams part by part). Card heights are typical ones: the
 * real cards of the insights grow with their data.
 */

const Grid = ({ className, children }: { className: string; children: React.ReactNode }) => <div className={cn("grid grid-cols-1 gap-4", className)}>{children}</div>;
const Cards = ({ count, className }: { count: number; className: string }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} className={cn("rounded-lg", className)} />
    ))}
  </>
);

/** A section's title line ("Orders", "Visitors"). */
const SectionTitle = () => (
  <div className="pt-2">
    <Skeleton className="h-7 w-24" />
  </div>
);

export const TotalsLoading = () => (
  <Grid className={THREE_GRID}>
    <Cards count={3} className="h-[109px]" />
  </Grid>
);

export const ChartLoading = () => <Skeleton className="h-[465px] rounded-lg md:h-[449px]" />;

export const OrderNumbersLoading = () => (
  <>
    <Grid className={orderNumbersGrid(5)}>
      <Cards count={5} className="h-[125px] sm:h-[141px]" />
    </Grid>
    <Grid className={PAIR_GRID}>
      <Cards count={2} className="h-[256px] md:h-[291px]" />
    </Grid>
  </>
);

/** The "Insights" title, its note and the range picker. */
export const InsightsHeaderLoading = () => (
  <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
    <div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-12 w-72 max-w-full sm:h-4" />
    </div>
    <Skeleton className="h-10 w-[176px]" />
  </div>
);

export const InsightsLoading = () => (
  <>
    <Grid className={INSIGHT_NUMBERS_GRID}>
      <Cards count={4} className="h-[130px] sm:h-[141px]" />
    </Grid>
    <Grid className={INSIGHT_CARDS_GRID}>
      <Cards count={6} className="h-[300px]" />
    </Grid>
  </>
);

/** The visitor numbers: title, note, three numbers, two panels and the countries card. */
export const VisitorsLoading = () => (
  <>
    <SectionTitle />
    <div className="-mt-3">
      <Skeleton className="h-12 w-[457px] max-w-full sm:h-4" />
    </div>
    <Grid className={THREE_GRID}>
      <Cards count={3} className="h-[156px] sm:h-[161px]" />
    </Grid>
    <Grid className={PAIR_GRID}>
      <Cards count={2} className="h-[258px] md:h-[207px]" />
    </Grid>
    <Grid className="">
      <Cards count={1} className="h-[320px] md:h-[402px]" />
    </Grid>
  </>
);

/** The whole dashboard, for its loading.tsx (before any part has started). */
export const DashboardLoading = () => (
  <PageFrame fluid>
    <HeadingLoading titleW="w-40" descW="w-[190px]" wrapDesc={false} />
    <SeparatorLoading />
    <TotalsLoading />
    {/* Like the real chart, which sits in a "contents" wrapper: no gap between it and the title below. */}
    <div className="contents">
      <ChartLoading />
    </div>
    <SectionTitle />
    <OrderNumbersLoading />
    <InsightsHeaderLoading />
    <InsightsLoading />
    <VisitorsLoading />
  </PageFrame>
);
