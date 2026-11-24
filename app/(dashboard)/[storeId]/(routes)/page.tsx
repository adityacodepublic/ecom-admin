import { Suspense } from "react";
import { cookies } from "next/headers";
import { CreditCard, DollarSign, Package } from "lucide-react";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { Separator } from "@/components/ui/separator";
import { Heading } from "@/components/ui/heading";
import { ChartLoading, OrderNumbersLoading, TotalsLoading, VisitorsLoading, InsightsLoading } from "@/components/loading/dashboard-loadings";
import { SectionError } from "@/components/section-error";
import { getStockCount } from "@/actions/get-stock-count";
import { getVisitorInsights } from "@/lib/clarity-insights";
import { formatINR } from "@/lib/money";
import { minimizedCookie, parseMinimized } from "@/lib/minimized-cards";
import { getOrderStats } from "@/lib/orders/queries";
import { getStoreAnalytics, parseRange } from "@/lib/orders/analytics";
import { dashCard, MinimizableGrid, StatCard } from "@/components/dashboard/cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ClarityVisitors } from "@/components/dashboard/clarity-visitors";
import { Minimizable, MinimizedList, MinimizeProvider } from "@/components/dashboard/minimize";
import { OrderStatsCards } from "@/components/dashboard/order-stats-cards";
import { InsightsHeader, StoreAnalyticsCards } from "@/components/dashboard/store-analytics";

interface DashboardPageProps {
  params: Promise<{
    storeId: string;
  }>;
  searchParams: Promise<{ days?: string | string[] }>;
}

// The three total cards at the top, with fixed ids for the "minimized" cookie.
const TOTALS = [
  { id: "total-revenue", title: "Total Revenue", Icon: DollarSign },
  { id: "total-sales", title: "Sales", Icon: CreditCard },
  { id: "total-stock", title: "Products In Stock", Icon: Package },
] as const;

/** The three total cards at the top, each of which can be minimized. */
const TotalCards = async ({ data }: { data: Promise<[number, number, number]> }) => {
  const values = await data;
  const shown = [formatINR(values[0]), `+${values[1]}`, String(values[2])];
  return (
    <MinimizableGrid className="sm:grid-cols-3" cards={TOTALS.map(({ id, title, Icon }, i) => dashCard(id, title, <StatCard title={title} value={shown[i]} Icon={Icon} />))} />
  );
};

/**
 * The dashboard streams: after the owner check, every read is started at once and none is awaited here. Each section
 * gets its promise and its own <Suspense>, so the page shows at once and each part fills in as soon as its own data
 * is ready (a slow part does not hold up the others). The cards inside one section share one read, so they arrive together.
 */
const DashboardPage: React.FC<DashboardPageProps> = async ({ params, searchParams }) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);
  const days = parseRange((await searchParams).days); // the Insights range (?days=)
  const minimized = parseMinimized((await cookies()).get(minimizedCookie(storeId))?.value);

  const orderStats = getOrderStats(storeId);
  // The totals and the chart are parts of the order numbers (one read), plus the stock count.
  const totals = Promise.all([orderStats, getStockCount(storeId)]).then(([s, stock]): [number, number, number] => [s.revenuePaise, s.paidOrders, stock]);
  const months = orderStats.then((s) => s.revenueByMonth);
  const analytics = getStoreAnalytics(storeId, days);
  // Waits on Clarity only when its saved numbers are due a refresh.
  const visitors = getVisitorInsights(storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Heading title="Dashboard" description="Overview of your store" />
        <Separator />
        <MinimizeProvider storeId={storeId} initial={minimized}>
          <SectionError title="the totals">
            <Suspense fallback={<TotalsLoading />}>
              <TotalCards data={totals} />
            </Suspense>
          </SectionError>
          <Minimizable id="revenue-by-month" title="Revenue by month">
            <SectionError title="the chart">
              <Suspense fallback={<ChartLoading />}>
                <RevenueChart storeId={storeId} data={months} />
              </Suspense>
            </SectionError>
          </Minimizable>
          <h3 className="pt-2 text-lg font-semibold">Orders</h3>
          <SectionError title="the order numbers">
            <Suspense fallback={<OrderNumbersLoading />}>
              <OrderStatsCards storeId={storeId} data={orderStats} />
            </Suspense>
          </SectionError>
          <InsightsHeader days={days} />
          <SectionError title="the insights">
            <Suspense fallback={<InsightsLoading />}>
              <StoreAnalyticsCards storeId={storeId} data={analytics} />
            </Suspense>
          </SectionError>
          <SectionError title="the visitor numbers">
            <Suspense fallback={<VisitorsLoading />}>
              <ClarityVisitors storeId={storeId} data={visitors} />
            </Suspense>
          </SectionError>
          {/* The one list of minimized cards for the whole page, at the end (out of the way of the numbers): a
              minimized card waits here, a click brings it back. Minimizing scrolls down to it. */}
          <MinimizedList />
        </MinimizeProvider>
      </div>
    </div>
  );
};

export default DashboardPage;
