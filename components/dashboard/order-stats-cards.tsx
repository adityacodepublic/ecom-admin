import Link from "next/link";
import { Banknote, IndianRupee, PackageCheck, ShoppingBag } from "lucide-react";

import { statusTone } from "@/components/orders/status-badge";
import { formatINR } from "@/lib/money";
import type { OrderStats } from "@/lib/orders/queries";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

import { cardTitles, dashCard, InsightCard, MinimizableGrid, plural, StatCard } from "./cards";
import { MinimizedList } from "./minimize";

// Bars use the theme's blue, and soft (pastel) tints where a colour has to mean something (done, cancelled, waiting).
const BAR: Record<string, string> = {
  slate: "bg-slate-400/60",
  blue: "bg-blue-500",
  amber: "bg-amber-300/80",
  green: "bg-emerald-300/80",
  red: "bg-rose-300/80",
};
const PAY_BAR: Record<PaymentStatus, string> = { PAID: BAR.green, PENDING: BAR.amber, FAILED: BAR.red, PARTIALLY_REFUNDED: BAR.slate, REFUNDED: BAR.slate };

/** One compact bar row that links to the orders it counts. */
const BarRow = ({ href, label, n, max, bar }: { href: string; label: string; n: number; max: number; bar: string }) => (
  <Link href={href} className="-mx-1 flex items-center gap-3 rounded-sm px-1 text-xs hover:bg-accent">
    <span className="w-28 shrink-0 truncate">{label}</span>
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <span className={cn("block h-full rounded-full", bar)} style={{ width: `${(n / max) * 100}%` }} />
    </span>
    <span className="w-8 text-right tabular-nums text-muted-foreground">{n}</span>
  </Link>
);

/** Order cards for the dashboard (below the older cards). `data` is started by the page and not awaited there (streamed). */
export const OrderStatsCards = async ({ storeId, data }: { storeId: string; data: Promise<OrderStats> }) => {
  const stats = await data;
  const orders = (filter: Record<string, string> = {}) => `/${storeId}/orders${Object.keys(filter).length ? `?${new URLSearchParams(filter)}` : ""}`;
  const count = (s: string) => stats.byStatus[s] ?? 0;
  const max = Math.max(1, stats.returned, ...stats.statuses.map(count));
  const payMax = Math.max(1, ...PAYMENT_STATUSES.map((s) => stats.byPaymentStatus[s]));

  const numbers = [
    dashCard(
      "orders-new",
      "New orders",
      <StatCard title="New orders" value={String(stats.newOrders)} note={`${stats.newStatus}, waiting for you`} href={orders({ status: stats.newStatus })} Icon={ShoppingBag} />,
    ),
    dashCard(
      "orders-progress",
      "In progress",
      <StatCard title="In progress" value={String(stats.inProgress)} note="After the first step, before the last" href={orders()} Icon={PackageCheck} />,
    ),
    dashCard(
      "orders-cod",
      "COD to collect",
      <StatCard
        title="COD to collect"
        value={formatINR(stats.codToCollect.amountPaise)}
        note={`${plural(stats.codToCollect.count, "cash on delivery order")} not paid yet`}
        href={orders({ paymentStatus: "PENDING" })}
        Icon={Banknote}
      />,
    ),
    dashCard(
      "orders-revenue",
      "Revenue (paid)",
      <StatCard
        title="Revenue (paid)"
        value={formatINR(stats.revenuePaise)}
        note={`From ${plural(stats.paidOrders, "paid order")}`}
        href={orders({ paymentStatus: "PAID" })}
        Icon={IndianRupee}
      />,
    ),
  ];
  const bars = [
    dashCard(
      "orders-by-status",
      "Orders by status",
      <InsightCard title="Orders by status" note="All time. A return is not a status: those orders are counted again under Returned." contentClassName="space-y-1.5">
        {stats.statuses.map((s) => (
          <BarRow key={s} href={orders({ status: s })} label={s} n={count(s)} max={max} bar={BAR[statusTone(s, stats.steps)]} />
        ))}
        <BarRow href={orders({ returned: "1" })} label="Returned" n={stats.returned} max={max} bar={BAR.amber} />
      </InsightCard>,
    ),
    dashCard(
      "orders-by-payment",
      "Orders by payment",
      <InsightCard title="Orders by payment" note="All time, cancelled orders included." contentClassName="space-y-1.5">
        {PAYMENT_STATUSES.map((s) => (
          <BarRow key={s} href={orders({ paymentStatus: s })} label={PAYMENT_STATUS_LABELS[s]} n={stats.byPaymentStatus[s]} max={payMax} bar={PAY_BAR[s]} />
        ))}
      </InsightCard>,
    ),
  ];

  return (
    <>
      <MinimizableGrid cards={numbers} className="sm:grid-cols-2 lg:grid-cols-4" />
      <MinimizableGrid cards={bars} className="md:grid-cols-2">
        <MinimizedList cards={cardTitles([...numbers, ...bars])} />
      </MinimizableGrid>
    </>
  );
};
