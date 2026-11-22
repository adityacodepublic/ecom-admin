"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";

import { formatINR } from "@/lib/money";
import type { MonthRevenue } from "@/lib/orders/queries";

import { Empty, InsightCard, plural } from "./cards";

const BLUE = "#3b82f6"; // the theme blue of the other dashboard bars (bg-blue-500)

/** Rupees on the axis, the Indian way: ₹1.2 Cr, ₹30 L, ₹45k. */
const shortRupees = (rupees: number) => {
  const short = (n: number, unit: string) => `₹${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;
  if (rupees >= 1e7) return short(rupees / 1e7, " Cr");
  if (rupees >= 1e5) return short(rupees / 1e5, " L");
  if (rupees >= 1e3) return short(Math.round(rupees / 1e3), "k");
  return `₹${rupees}`;
};

const MonthTip = ({ active, payload }: TooltipProps<number, string>) => {
  const m = payload?.[0]?.payload as MonthRevenue | undefined;
  if (!active || !m) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">
        {m.label} {m.month.slice(0, 4)}
      </div>
      <div className="tabular-nums">{formatINR(m.revenuePaise)}</div>
      <div className="text-muted-foreground">
        From {plural(m.orders, "paid order")}
        {m.orders ? ". Click to see them" : ""}
      </div>
    </div>
  );
};

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
        <ResponsiveContainer width="100%" height={350}>
          {/* A click anywhere in a month's column (not only on its bar) opens that month. */}
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            className="cursor-pointer"
            onClick={(state) => state?.activeTooltipIndex !== undefined && open(rows[state.activeTooltipIndex])}
          >
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={64} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={shortRupees} />
            <Tooltip content={<MonthTip />} cursor={{ fill: "hsl(var(--accent))" }} />
            <Bar dataKey="rupees" radius={[4, 4, 0, 0]}>
              {rows.map((m, i) => (
                <Cell key={m.month} fill={BLUE} fillOpacity={i === peak ? 1 : 0.4} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </InsightCard>
  );
};
