"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";

import { formatINR } from "@/lib/money";
import type { MonthRevenue } from "@/lib/orders/queries";

import { plural } from "./cards";

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

export type RevenueRow = MonthRevenue & { rupees: number };

/** The recharts bars themselves. Kept in its own file so recharts loads as a separate chunk (see revenue-chart.tsx). */
export default function RevenueBars({ rows, peak, onOpen }: { rows: RevenueRow[]; peak: number; onOpen: (m: MonthRevenue) => void }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      {/* A click anywhere in a month's column (not only on its bar) opens that month. */}
      <BarChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        className="cursor-pointer"
        onClick={(state) => state?.activeTooltipIndex !== undefined && onOpen(rows[state.activeTooltipIndex])}
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
  );
}
