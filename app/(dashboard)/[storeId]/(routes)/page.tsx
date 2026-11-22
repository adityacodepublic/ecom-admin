import { Suspense } from "react";
import { cookies } from "next/headers";
import { CreditCard, DollarSign, Package } from "lucide-react";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { Separator } from "@/components/ui/separator";
import { Overview } from "@/components/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { CardGridSkeleton, Skeleton } from "@/components/ui/skeleton";
import { SectionError } from "@/components/section-error";
import { getStockCount } from "@/actions/get-stock-count";
import { getVisitorInsights } from "@/lib/clarity-insights";
import { formatINR } from "@/lib/money";
import { minimizedCookie, parseMinimized } from "@/lib/minimized-cards";
import { getOrderStats } from "@/lib/orders/queries";
import { getStoreAnalytics, parseRange } from "@/lib/orders/analytics";
import { StatCard } from "@/components/dashboard/cards";
import { ClarityVisitors } from "@/components/dashboard/clarity-visitors";
import { MinimizeProvider } from "@/components/dashboard/minimize";
import { OrderStatsCards } from "@/components/dashboard/order-stats-cards";
import { InsightsHeader, StoreAnalyticsCards } from "@/components/dashboard/store-analytics";

interface DashboardPageProps {
  params: Promise<{
    storeId: string;
  }>;
  searchParams: Promise<{ days?: string | string[] }>;
}

/** The three total cards at the top. */
const TotalCards = async ({ data }: { data: Promise<[number, number, number]> }) => {
  const [totalRevenue, salesCount, stockCount] = await data;
  const cards = [
    { title: "Total Revenue", value: formatINR(totalRevenue), Icon: DollarSign },
    { title: "Sales", value: `+${salesCount}`, Icon: CreditCard },
    { title: "Products In Stock", value: String(stockCount), Icon: Package },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <StatCard key={c.title} {...c} />
      ))}
    </div>
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
  const graph = orderStats.then((s) => s.revenueByMonth.map((m) => ({ name: m.month, total: m.revenuePaise / 100 }))); // rupees, for the chart axis
  const analytics = getStoreAnalytics(storeId, days);
  // Waits on Clarity only when its saved numbers are due a refresh.
  const visitors = getVisitorInsights(storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Heading title="Dashboard" description="Overview of your store" />
        <Separator />
        <SectionError title="the totals">
          <Suspense fallback={<CardGridSkeleton count={3} className="sm:grid-cols-3" />}>
            <TotalCards data={totals} />
          </Suspense>
        </SectionError>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <SectionError title="the chart">
              <Suspense fallback={<Skeleton className="ml-4 h-[350px]" />}>
                <Overview data={graph} />
              </Suspense>
            </SectionError>
          </CardContent>
        </Card>
        <MinimizeProvider storeId={storeId} initial={minimized}>
          <h3 className="pt-2 text-lg font-semibold">Orders</h3>
          <SectionError title="the order numbers">
            <Suspense
              fallback={
                <>
                  <CardGridSkeleton count={4} className="sm:grid-cols-2 lg:grid-cols-4" />
                  <CardGridSkeleton count={2} className="md:grid-cols-2" cardClassName="h-56" />
                </>
              }
            >
              <OrderStatsCards storeId={storeId} data={orderStats} />
            </Suspense>
          </SectionError>
          <InsightsHeader days={days} />
          <SectionError title="the insights">
            <Suspense
              fallback={
                <>
                  <CardGridSkeleton count={4} className="sm:grid-cols-2 lg:grid-cols-4" />
                  <CardGridSkeleton count={6} className="md:grid-cols-2 lg:grid-cols-3" cardClassName="h-48" />
                </>
              }
            >
              <StoreAnalyticsCards storeId={storeId} data={analytics} />
            </Suspense>
          </SectionError>
          <SectionError title="the visitor numbers">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading visitor numbers…</p>}>
              <ClarityVisitors storeId={storeId} data={visitors} />
            </Suspense>
          </SectionError>
        </MinimizeProvider>
      </div>
    </div>
  );
};

export default DashboardPage;
