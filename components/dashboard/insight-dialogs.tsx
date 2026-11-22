"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { durationLabel, formatIstDate, formatIstDateTime } from "@/lib/format-date";
import { formatINR } from "@/lib/money";
import type { AdminOrderList } from "@/lib/orders/queries";
import { hourRangeLabel, WEEKDAYS } from "@/lib/shop-time";

import { countLabel, Empty, InsightCard, pct, plural, StatCard } from "./cards";

/**
 * Dashboard cards whose rows open a table, for the numbers that have no page of their own (a reason, a group of
 * buyers, delivery times, an hour of the day). The table lists the orders or customers behind the number, each with
 * a link to its page, and a link to the same orders on the Orders page.
 */

/** A dialog holding a scrolling table, with an optional link under it. */
const TableDialog = ({
  open,
  onClose,
  title,
  description,
  link,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description: React.ReactNode;
  link?: { href: string; label: string };
  wide?: boolean;
  children: React.ReactNode;
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className={wide ? "max-w-3xl" : "max-w-2xl"}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
      {link && (
        <Link href={link.href} className="text-sm underline">
          {link.label}
        </Link>
      )}
    </DialogContent>
  </Dialog>
);

const Scroll = ({ children }: { children: React.ReactNode }) => (
  <div className="max-h-[60vh] overflow-auto rounded-md border">
    <Table>{children}</Table>
  </div>
);

const OrderLink = ({ storeId, orderNumber }: { storeId: string; orderNumber: number }) => (
  <TableCell className="font-medium">
    <Link href={`/${storeId}/orders/${orderNumber}`} className="underline">
      #{orderNumber}
    </Link>
  </TableCell>
);

const hideOnPhone = "hidden sm:table-cell";

/** A card row that opens a dialog: the label, then its count and an arrow. */
const RowButton = ({ label, count, onClick, ariaLabel }: { label: string; count: React.ReactNode; onClick: () => void; ariaLabel?: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="flex w-full items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="truncate">{label}</span>
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
      {count}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </span>
  </button>
);

type ReasonOrder = { id: string; orderNumber: number; customer: string; paise: number; at: string };
type Reason = { reason: string; n: number; orders: ReasonOrder[] };

/** "Why orders were cancelled / returned": each reason opens the orders that gave it. */
export const ReasonCard = ({
  storeId,
  title,
  note,
  reasons,
  allHref,
  allLabel,
}: {
  storeId: string;
  title: string;
  note: string;
  reasons: Reason[];
  allHref: string;
  allLabel: string;
}) => {
  const [open, setOpen] = useState<Reason | null>(null);
  return (
    <InsightCard title={title} note={note} contentClassName="space-y-1 text-sm">
      {reasons.length === 0 && <Empty />}
      {reasons.map((r) => (
        <RowButton key={r.reason} label={r.reason} count={r.n} onClick={() => setOpen(r)} ariaLabel={`${r.reason}: ${plural(r.n, "order")}. Show them`} />
      ))}
      {reasons.length > 0 && (
        <Link href={allHref} className="block pt-1 text-xs text-muted-foreground underline">
          {allLabel}
        </Link>
      )}
      <TableDialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.reason}
        description={open && `${countLabel(open.orders.length, open.n)} Open an order to follow up with the customer or update it.`}
        link={{ href: allHref, label: allLabel }}
      >
        <Scroll>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className={hideOnPhone}>Placed</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open?.orders.map((o) => (
              <TableRow key={o.id}>
                <OrderLink storeId={storeId} orderNumber={o.orderNumber} />
                <TableCell>{o.customer}</TableCell>
                <TableCell className={`${hideOnPhone} whitespace-nowrap`}>{formatIstDate(o.at)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatINR(o.paise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Scroll>
      </TableDialog>
    </InsightCard>
  );
};

export type Buyer = { id: string; name: string; email: string; phone: string; orders: number; paise: number; lastOrderAt: string | null };

/** Buyers: "New" and "Repeat" open the customers in that group; each top buyer goes to their orders. */
export const BuyersCard = ({ storeId, total, repeat, buyers }: { storeId: string; total: number; repeat: number; buyers: Buyer[] }) => {
  const [group, setGroup] = useState<"new" | "repeat" | null>(null);
  const rows = buyers.filter((b) => (group === "repeat" ? b.orders > 1 : b.orders === 1));
  const groupCount = group === "repeat" ? repeat : total - repeat;
  const buyerOrders = (id: string) => `/${storeId}/orders?buyer=${encodeURIComponent(id)}`;
  return (
    <InsightCard title="Buyers" note="All time, this store. Repeat = more than one order" contentClassName="space-y-1 text-sm">
      {total === 0 ? (
        <Empty />
      ) : (
        <>
          <RowButton label="New buyers" count={total - repeat} onClick={() => setGroup("new")} />
          <RowButton label="Repeat buyers" count={`${repeat} (${pct(repeat, total)})`} onClick={() => setGroup("repeat")} />
          {buyers.slice(0, 5).map((b) => (
            <Link key={b.id} href={buyerOrders(b.id)} className="flex justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-accent">
              <span className="truncate pl-3">{b.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {plural(b.orders, "order")}, {formatINR(b.paise)}
              </span>
            </Link>
          ))}
        </>
      )}
      <TableDialog
        wide
        open={!!group}
        onClose={() => setGroup(null)}
        title={group === "repeat" ? "Repeat buyers" : "New buyers"}
        description={`${group === "repeat" ? "Ordered more than once." : "Ordered once."} ${groupCount > rows.length ? `Top ${rows.length} of ${groupCount} by order value.` : `${plural(groupCount, "customer")}.`} Cancelled orders are not counted.`}
      >
        <Scroll>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className={hideOnPhone}>Contact</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Order value</TableHead>
              <TableHead className={hideOnPhone}>Last order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">
                  <Link href={buyerOrders(b.id)} className="underline">
                    {b.name}
                  </Link>
                </TableCell>
                <TableCell className={`${hideOnPhone} text-xs text-muted-foreground`}>
                  <div>{b.email}</div>
                  <div>{b.phone}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.orders}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatINR(b.paise)}</TableCell>
                <TableCell className={`${hideOnPhone} whitespace-nowrap`}>{b.lastOrderAt ? formatIstDate(b.lastOrderAt) : "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Scroll>
      </TableDialog>
    </InsightCard>
  );
};

type Delivered = { id: string; orderNumber: number; customer: string; placed: string; delivered: string; hours: number };

/** "Time to delivery": the card opens the delivered orders behind the average, with how long each one took. */
export const DeliveryCard = ({
  storeId,
  note,
  value,
  count,
  hours,
  orders,
  finalStatus,
  allHref,
}: {
  storeId: string;
  note: string;
  value: string;
  count: number; // all delivered orders in the range (the average is over these)
  hours: number; // their average
  orders: Delivered[]; // the newest of them
  finalStatus: string;
  allHref: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <StatCard title="Time to delivery" value={value} note={note} onClick={() => setOpen(true)} label={`Time to delivery: ${value}. Show the orders`} />
      <TableDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Time to delivery"
        description={`From when the order was placed to when it was first moved to ${finalStatus}. ${countLabel(orders.length, count)}`}
        link={{ href: allHref, label: `Open all orders at ${finalStatus}` }}
      >
        {count === 0 ? (
          <Empty />
        ) : (
          <Scroll>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead className={hideOnPhone}>Customer</TableHead>
                <TableHead className={hideOnPhone}>Placed</TableHead>
                <TableHead>{finalStatus}</TableHead>
                <TableHead className="text-right">Took</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <OrderLink storeId={storeId} orderNumber={o.orderNumber} />
                  <TableCell className={hideOnPhone}>{o.customer}</TableCell>
                  <TableCell className={`${hideOnPhone} whitespace-nowrap`}>{formatIstDateTime(o.placed)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatIstDateTime(o.delivered)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{durationLabel(o.hours)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right">
                  Average{count > orders.length ? ` of all ${count} orders` : ""}: <span className="tabular-nums">{durationLabel(hours)}</span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Scroll>
        )}
      </TableDialog>
    </>
  );
};

/**
 * A small bar chart (plain CSS): one bar per label, the tallest one highlighted. A bar opens the orders placed in it,
 * read from the Orders API with the same filter the Orders page uses. `ticks` = which labels to print under the bars.
 */
export const WhenBars = ({
  storeId,
  title,
  note,
  labels,
  values,
  ticks,
  filter,
  from,
}: {
  storeId: string;
  title: string;
  note: string;
  labels: string[];
  values: number[];
  ticks: number[];
  filter: "hour" | "weekday"; // the Orders filter for one bar (its index)
  from: string; // first day of the range
}) => {
  const [open, setOpen] = useState<number | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string; list: AdminOrderList | null }>({ loading: false, error: "", list: null });
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = values.indexOf(Math.max(...values));
  const params = (i: number) => new URLSearchParams({ from, [filter]: String(i) });

  const show = async (i: number) => {
    setOpen(i);
    setState({ loading: true, error: "", list: null });
    try {
      const res = await fetch(`/api/${storeId}/orders?${params(i)}&pageSize=50`);
      if (!res.ok) throw new Error(String(res.status));
      setState({ loading: false, error: "", list: (await res.json()) as AdminOrderList });
    } catch {
      setState({ loading: false, error: "Could not load the orders. Try again.", list: null });
    }
  };

  const list = state.list;
  return (
    <InsightCard title={title} note={total > 0 ? `${note}. Busiest: ${labels[peak]} (${values[peak]}). Click a bar to see its orders` : note}>
      {total === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex h-24 items-end gap-0.5">
            {values.map((v, i) => (
              <button
                key={labels[i]}
                type="button"
                disabled={v === 0}
                onClick={() => show(i)}
                title={`${labels[i]}: ${plural(v, "order")}`}
                aria-label={`${labels[i]}: ${plural(v, "order")}${v ? ". Show them" : ""}`}
                className="group flex h-full flex-1 items-end rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
              >
                <span
                  className={`block w-full rounded-sm ${i === peak ? "bg-blue-500" : "bg-blue-500/40 group-hover:bg-blue-500/70"}`}
                  style={{ height: `${Math.max(v > 0 ? 4 : 0, (v / max) * 100)}%` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-0.5 text-[10px] text-muted-foreground">
            {values.map((_, i) => (
              <span key={labels[i]} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {ticks.includes(i) ? labels[i] : ""}
              </span>
            ))}
          </div>
        </>
      )}
      <TableDialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={`Orders placed ${open === null ? "" : filter === "hour" ? `from ${hourRangeLabel(open)}` : `on ${WEEKDAYS[open]}s`}`}
        description={`${list ? `${countLabel(list.orders.length, list.totalCount)} ` : ""}${note}.`}
        link={open === null ? undefined : { href: `/${storeId}/orders?${params(open)}`, label: "Open these orders in Orders" }}
      >
        {state.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {list && (
          <Scroll>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className={hideOnPhone}>Placed</TableHead>
                <TableHead className={hideOnPhone}>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.orders.map((o) => (
                <TableRow key={o.id}>
                  <OrderLink storeId={storeId} orderNumber={o.orderNumber} />
                  <TableCell>{o.shipTo?.name || o.customer?.fname || "Customer"}</TableCell>
                  <TableCell className={`${hideOnPhone} whitespace-nowrap`}>{formatIstDateTime(o.createdAt)}</TableCell>
                  <TableCell className={hideOnPhone}>{o.status}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{formatINR(o.totalPaise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Scroll>
        )}
      </TableDialog>
    </InsightCard>
  );
};
