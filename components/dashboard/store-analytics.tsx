import Link from "next/link";

import { INSIGHT_CARDS_GRID, INSIGHT_NUMBERS_GRID } from "@/lib/dashboard-grids";
import { formatINR } from "@/lib/money";
import { durationLabel } from "@/lib/format-date";
import { RANGE_OPTIONS, type StoreAnalytics } from "@/lib/orders/analytics";
import { CANCELLED } from "@/lib/orders/status";
import { hourLabel, WEEKDAYS } from "@/lib/shop-time";

import { dashCard, Empty, InsightCard, MinimizableGrid, pct, plural, StatCard, rowLink } from "./cards";
import { BuyersCard, DeliveryCard, ReasonCard, WhenBars } from "./insight-dialogs";
import { RangeSelect } from "./range-select";
import { WaitingCard } from "./waiting-card";

/** A titled card holding rows of "label ... value". A row with an href is a link to the data behind it. */
const Rows = ({ title, note, rows }: { title: string; note?: string; rows: { key: string; label: React.ReactNode; value: string; href?: string }[] }) => (
  <InsightCard title={title} note={note} contentClassName="space-y-1 text-sm">
    {rows.length === 0 && <Empty />}
    {rows.map((r) =>
      r.href ? (
        <Link key={r.key} href={r.href} className={rowLink}>
          <span className="truncate">{r.label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{r.value}</span>
        </Link>
      ) : (
        <div key={r.key} className="flex justify-between gap-3">
          <span className="truncate">{r.label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{r.value}</span>
        </div>
      ),
    )}
  </InsightCard>
);

/** The Insights title and its range select. Outside the cards' Suspense: it shows at once, and keeps the range while new numbers load. */
export const InsightsHeader = ({ days }: { days: number }) => (
  <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
    <div>
      <h3 className="text-lg font-semibold">Insights</h3>
      <p className="text-xs text-muted-foreground">
        Last {days} days unless it says otherwise. Revenue counts paid orders, cancelled orders left out. Click a number to see the orders behind it. Right-click or long-press a
        card to minimize it.
      </p>
    </div>
    <RangeSelect value={days} options={RANGE_OPTIONS} />
  </div>
);

/** Store insights for the dashboard (below the order cards). Numbers come from lib/orders/analytics.ts; `data` is started by the page and not awaited there. */
export const StoreAnalyticsCards = async ({ storeId, data }: { storeId: string; data: Promise<StoreAnalytics> }) => {
  const a = await data;
  const days = `Last ${a.windowDays} days`;
  // Links to the Orders page for the same range (a.from = the first day), so a card and its list show the same orders.
  const orders = (filters: Record<string, string>) => `/${storeId}/orders?${new URLSearchParams({ ...filters, from: a.from })}`;
  const { stock, buyers } = a;
  const max = Math.max(1, ...a.categories.map((c) => c.paise));
  const stockRows = (title: string, g: { count: number; items: { id: string; name: string; quantity: number }[] }) => [
    { key: title, label: <span className="font-medium">{title}</span>, value: String(g.count) },
    ...g.items.map((p) => ({
      key: `${title}-${p.id}`,
      label: (
        <Link href={`/${storeId}/products/${p.id}`} className="pl-3 hover:underline">
          {p.name}
        </Link>
      ),
      value: `${p.quantity} left`,
    })),
  ];

  const card = dashCard;
  const stats = [
    card(
      "avg-order",
      "Average order value",
      <StatCard
        title="Average order value"
        value={formatINR(a.revenue.averagePaise)}
        note={`${days}, from ${plural(a.revenue.orders, "paid order")}`}
        href={orders({ paymentStatus: "PAID" })}
      />,
    ),
    card(
      "cancel-rate",
      "Cancel rate",
      <StatCard
        title="Cancel rate"
        value={pct(a.cancelled.count, a.cancelled.orders)}
        note={`${a.cancelled.count} of ${a.cancelled.orders} orders, ${days.toLowerCase()}`}
        href={orders({ status: CANCELLED })}
      />,
    ),
    card(
      "return-rate",
      "Return rate",
      <StatCard
        title="Return rate"
        value={pct(a.returned.count, a.returned.orders)}
        note={`${a.returned.count} of ${a.returned.orders} orders, ${days.toLowerCase()}`}
        href={orders({ returned: "1" })}
      />,
    ),
    card(
      "delivery-time",
      "Time to delivery",
      <DeliveryCard
        storeId={storeId}
        from={a.from}
        value={a.delivery.count ? durationLabel(a.delivery.hours) : "–"}
        note={a.delivery.count ? `Average over ${plural(a.delivery.count, "order")} delivered, ${days.toLowerCase()}. Click to see each one` : "No delivered orders yet"}
        count={a.delivery.count}
        hours={a.delivery.hours}
        finalStatus={a.finalStatus}
        allHref={`/${storeId}/orders?${new URLSearchParams({ status: a.finalStatus })}`}
      />,
    ),
  ];

  const rest = [
    card("waiting", "Orders waiting too long", <WaitingCard storeId={storeId} waiting={a.waiting} />),
    card(
      "top-units",
      "Top products by units",
      <Rows
        title="Top products by units"
        note={days}
        rows={a.topProducts.byUnits.map((p) => ({ key: p.id, label: p.name, value: `${p.units} sold`, href: `/${storeId}/products/${p.id}` }))}
      />,
    ),
    card(
      "top-revenue",
      "Top products by revenue",
      <Rows
        title="Top products by revenue"
        note={days}
        rows={a.topProducts.byRevenue.map((p) => ({ key: p.id, label: p.name, value: formatINR(p.paise), href: `/${storeId}/products/${p.id}` }))}
      />,
    ),
    card(
      "category-revenue",
      "Revenue by category",
      <InsightCard title="Revenue by category" note={`${days}, products only (no shipping)`} contentClassName="space-y-2 text-sm">
        {a.categories.length === 0 && <Empty />}
        {a.categories.map((c) => (
          <div key={c.category}>
            <div className="flex justify-between gap-3">
              <span className="truncate">{c.category}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatINR(c.paise)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.paise / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </InsightCard>,
    ),
    card(
      "cancel-reasons",
      "Why orders were cancelled",
      <ReasonCard
        storeId={storeId}
        kind="cancel"
        from={a.from}
        title="Why orders were cancelled"
        note={`${days}. Click a reason to see the orders`}
        reasons={a.cancelled.reasons}
        allHref={orders({ status: CANCELLED })}
        allLabel="Open all cancelled orders"
      />,
    ),
    card(
      "return-reasons",
      "Why orders were returned",
      <ReasonCard
        storeId={storeId}
        kind="return"
        from={a.from}
        title="Why orders were returned"
        note={`${days}. Click a reason to see the orders`}
        reasons={a.returned.reasons}
        allHref={orders({ returned: "1" })}
        allLabel="Open all orders with a return"
      />,
    ),
    card(
      "stock",
      "Stock",
      <Rows
        title="Stock"
        note={`Low = ${stock.lowAt} or fewer left. Dead = in stock, not ordered for ${stock.dead.days} days`}
        rows={[...stockRows("Low stock", stock.low), ...stockRows("Out of stock", stock.out), ...stockRows("Dead stock", stock.dead)]}
      />,
    ),
    card("buyers", "Buyers", <BuyersCard storeId={storeId} total={buyers.total} repeat={buyers.repeat} top={buyers.top} />),
    card(
      "by-hour",
      "Orders by hour of the day",
      <WhenBars
        storeId={storeId}
        from={a.from}
        filter="hour"
        title="Orders by hour of the day"
        note={`${days}, India time, cancelled orders left out`}
        labels={Array.from({ length: 24 }, (_, h) => hourLabel(h))}
        values={a.when.byHour}
        ticks={[0, 6, 12, 18]}
      />,
    ),
    card(
      "by-weekday",
      "Orders by weekday",
      <WhenBars
        storeId={storeId}
        from={a.from}
        filter="weekday"
        title="Orders by weekday"
        note={`${days}, India time, cancelled orders left out`}
        labels={WEEKDAYS.map((d) => d.slice(0, 3))}
        values={a.when.byWeekday}
        ticks={[0, 1, 2, 3, 4, 5, 6]}
      />,
    ),
    ...(
      [
        ["by-state", "Orders by state", a.geography.states],
        ["by-city", "Orders by city", a.geography.cities],
        ["by-pincode", "Orders by pincode", a.geography.pincodes],
      ] as const
    ).map(([id, title, places]) =>
      card(
        id,
        title,
        <Rows
          title={title}
          note={`${days}, cancelled orders left out. Revenue = paid`}
          rows={places.map((g) => ({ key: g.place, label: g.place, value: `${plural(g.orders, "order")}, ${formatINR(g.paise)}`, href: orders(g.filter) }))}
        />,
      ),
    ),
  ];
  return (
    <>
      <MinimizableGrid cards={stats} className={INSIGHT_NUMBERS_GRID} />
      <MinimizableGrid cards={rest} className={INSIGHT_CARDS_GRID} />
    </>
  );
};
