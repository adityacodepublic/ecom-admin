"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { use } from "react";

import type { MonthRevenue } from "@/lib/orders/queries";

import { Empty, InsightCard } from "./cards";

// recharts (plus its lodash/d3 dependencies) is the largest client dependency of the dashboard route. It loads as its
// own chunk after the page hydrates; ResponsiveContainer renders nothing until it has measured the browser anyway, so
// nothing is lost on the server. The placeholder has the chart's exact height (350px) so the card does not jump.
const RevenueBars = dynamic(() => import("./revenue-bars"), {
  ssr: false,
  loading: () => <div className="h-[350px]" aria-hidden />,
});

/**
 * Paid revenue per month, the last 12 months. The best month is the full theme blue, the others lighter (like the
 * hour and weekday bars); a bar opens that month's paid orders on the Orders page. `data` is started on the server
 * and not awaited there: read here with use(), inside the dashboard's <Suspense>.
 */
export const RevenueChart = ({ storeId, data }: { storeId: string; data: Promise<MonthRevenue[]> }) => {
  const months = use(data);
  const router = useRouter();
  const rows = months.map((m) => ({ ...m, rupees: m.revenuePaise / 100 }));
  const peak = rows.reduce((best, m, i) => (m.rupees > rows[best].rupees ? i : best), 0);
  const open = (m: MonthRevenue) => m.orders > 0 && router.push(`/${storeId}/orders?${new URLSearchParams({ paymentStatus: "PAID", from: m.from, to: m.to })}`);

  return (
    <InsightCard title="Revenue by month" note="Paid orders, cancelled orders left out, the last 12 months (India time). Click a bar to see its orders">
      {rows.every((m) => m.rupees === 0) ? (
        <Empty text="No paid orders in the last 12 months." />
      ) : (
        <RevenueBars rows={rows} peak={peak} onOpen={open} />
      )}
    </InsightCard>
  );
};
