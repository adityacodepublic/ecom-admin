import Link from "next/link";
import { Banknote, IndianRupee, PackageCheck, ShoppingBag } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import type { OrderStats } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

import { statusTone } from "./status-badge";

const BAR: Record<string, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  red: "bg-red-500",
};

/** Order cards for the dashboard (below the older cards). */
export const OrderStatsCards = ({ storeId, stats }: { storeId: string; stats: OrderStats }) => {
  const orders = `/${storeId}/orders`;
  const count = (s: string) => stats.byStatus[s] ?? 0;
  const max = Math.max(1, ...stats.statuses.map(count));

  const cards = [
    { title: "New orders", value: String(stats.newOrders), note: `${stats.newStatus}, waiting for you`, href: `${orders}?status=${encodeURIComponent(stats.newStatus)}`, Icon: ShoppingBag },
    { title: "In progress", value: String(stats.inProgress), note: "After the first step, before the last", href: orders, Icon: PackageCheck },
    {
      title: "COD to collect",
      value: formatINR(stats.codToCollect.amountPaise),
      note: `${stats.codToCollect.count} cash on delivery order${stats.codToCollect.count === 1 ? "" : "s"} not paid yet`,
      href: `${orders}?paymentStatus=PENDING`,
      Icon: Banknote,
    },
    { title: "Revenue (paid)", value: formatINR(stats.revenuePaise), note: `From ${stats.paidOrders} paid order${stats.paidOrders === 1 ? "" : "s"}`, href: `${orders}?paymentStatus=PAID`, Icon: IndianRupee },
  ];

  return (
    <>
      <h3 className="pt-2 text-lg font-semibold">Orders</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, value, note, href, Icon }) => (
          <Link key={title} href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Orders by status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.statuses.map((s) => (
            <Link key={s} href={`${orders}?status=${encodeURIComponent(s)}`} className="flex items-center gap-3 text-sm hover:underline">
              <span className="w-32 shrink-0 truncate">{s}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", BAR[statusTone(s, stats.steps)])} style={{ width: `${(count(s) / max) * 100}%` }} />
              </span>
              <span className="w-10 text-right tabular-nums">{count(s)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
};
