"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { use } from "react";
import { Search, X } from "lucide-react";

import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnFilter, FilterChips } from "@/components/ui/column-filter";
import { Pager } from "@/components/ui/pager";
import { PaymentBadge, StatusBadge, paymentMethodLabel } from "@/components/orders/status-badge";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { formatINR } from "@/lib/money";
import { deliveryLabel, formatDay, formatIstDate, formatIstTime, tookLabel } from "@/lib/format-date";
import type { AdminOrderList, AdminOrderSummary } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

import { ORDER_FILTER_KEYS, type OrderFilters } from "@/lib/orders/list-query";

import { orderColumnFilters, type ColumnFilterDef } from "./order-filters";

export type OrdersData = { list: AdminOrderList; buyerName: string; productName: string };

const itemsSummary = (o: AdminOrderSummary) => {
  const names = o.itemNames.join(", ");
  const short = names.length > 60 ? `${names.slice(0, 57)}...` : names;
  return `${short || "No items"}${o.itemCount > 1 ? ` (${o.itemCount} items)` : ""}`;
};
const customerName = (o: AdminOrderSummary) => o.shipTo?.name || o.customer?.fname || "Unknown";
const customerPhone = (o: AdminOrderSummary) => o.shipTo?.phone || o.customer?.phone || "";
const place = (o: AdminOrderSummary) => [o.shipTo?.city, o.shipTo?.state].filter((x) => x?.trim()).join(", ");

/** Delivery cell: where the expected day stands, then how long a delivered order took (or the expected day). */
const DeliveryCell = ({ o, steps }: { o: AdminOrderSummary; steps: string[] }) => {
  const d = deliveryLabel(o.expectedDelivery, o.status, steps);
  return (
    <div>
      <div className={d.overdue ? "font-medium text-destructive" : ""}>{d.text}</div>
      {o.deliveredAt ? (
        <div className="text-xs text-muted-foreground">Took {tookLabel(o.createdAt, o.deliveredAt)}</div>
      ) : (
        o.expectedDelivery && <div className="text-xs text-muted-foreground">{formatDay(o.expectedDelivery)}</div>
      )}
    </div>
  );
};

/** A column title that is its filter. */
const FilterHead = ({ col, className }: { col: ColumnFilterDef; className?: string }) => (
  <TableHead className={className}>
    <ColumnFilter label={col.label} active={col.active} align={col.align}>
      {col.body}
    </ColumnFilter>
  </TableHead>
);

/** `data` is started on the server and not awaited there: read here with use(), inside the page's <Suspense>. */
export const OrdersClient = ({ data, filters }: { data: Promise<OrdersData>; filters: OrderFilters }) => {
  const { list, buyerName, productName } = use(data);
  const router = useRouter();
  const { storeId } = useParams<{ storeId: string }>();
  const { set, clear, pending } = useUrlFilters();
  const [search, setSearch] = useDebouncedSearch(filters.q, (q) => set({ q }));
  const { columns: cols, chips } = orderColumnFilters({ storeId, filters, list, buyerName, productName, set, search, setSearch });

  const allCount = Object.values(list.counts).reduce((n, c) => n + c, 0);
  const pages = Math.max(1, Math.ceil(list.totalCount / list.pageSize));
  const first = list.totalCount === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.page * list.pageSize, list.totalCount);
  const orderHref = (o: AdminOrderSummary) => `/${storeId}/orders/${o.orderNumber}`;
  const empty = filters.q ? `No orders match "${filters.q}".` : "No orders match these filters.";

  return (
    <>
      <Heading title={`Orders (${allCount})`} description="Manage orders for your store" />
      <Separator />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search orders"
              placeholder="Search order number, name, phone or email"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(filters.q || chips.length > 0) && (
            <Button variant="ghost" size="sm" onClick={() => clear(ORDER_FILTER_KEYS)}>
              <X className="mr-1 h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>

        {/* Phones have no table header: the same column filters as buttons. */}
        <div className="flex flex-wrap gap-1.5 md:hidden">
          {Object.values(cols).map((c) => (
            <ColumnFilter key={c.key} label={c.label} active={c.active} variant="button">
              {c.body}
            </ColumnFilter>
          ))}
        </div>

        <FilterChips chips={chips}>
          {list.excludesCancelled && <span className="text-xs text-muted-foreground">Cancelled orders left out.</span>}
          <span className="text-xs text-muted-foreground">
            <span className="hidden md:inline">Click a column title to filter by it.</span>
            <span className="md:hidden">Tap a button above to filter.</span>
          </span>
        </FilterChips>
      </div>

      <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
        {/* Desktop table. The header stays even when nothing matches, so the filters can be changed. */}
        <div className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <FilterHead col={cols.date} />
                <FilterHead col={cols.customer} />
                <FilterHead col={cols.shipTo} />
                <FilterHead col={cols.items} />
                <FilterHead col={cols.total} className="text-right" />
                <FilterHead col={cols.payment} />
                <FilterHead col={cols.status} />
                <FilterHead col={cols.delivery} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {empty}
                  </TableCell>
                </TableRow>
              )}
              {list.orders.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(orderHref(o))}>
                  <TableCell className="font-medium">
                    <Link href={orderHref(o)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      #{o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{formatIstDate(o.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">{formatIstTime(o.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <div>{customerName(o)}</div>
                    <div className="text-xs text-muted-foreground">{customerPhone(o)}</div>
                  </TableCell>
                  <TableCell>
                    <div>{place(o) || "–"}</div>
                    <div className="text-xs text-muted-foreground">{o.shipTo?.pincode}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">{itemsSummary(o)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">{formatINR(o.totalPaise)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-sm">{paymentMethodLabel(o.payment)}</span>
                      <PaymentBadge status={o.paymentStatus} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={o.status} statuses={list.steps} />
                      {o.returnStatus && <span className="text-xs text-muted-foreground">Return: {o.returnStatus}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <DeliveryCell o={o} steps={list.steps} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Phone cards */}
        <div className="grid gap-3 md:hidden">
          {list.orders.length === 0 && <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">{empty}</div>}
          {list.orders.map((o) => {
            const d = deliveryLabel(o.expectedDelivery, o.status, list.steps);
            return (
              <Link key={o.id} href={orderHref(o)} className="block rounded-md border p-3 hover:bg-accent">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">#{o.orderNumber}</span>
                  <span className="flex items-center gap-2">
                    {o.returnStatus && <span className="text-xs text-muted-foreground">Return: {o.returnStatus}</span>}
                    <StatusBadge status={o.status} statuses={list.steps} />
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  {customerName(o)} <span className="text-muted-foreground">{customerPhone(o)}</span>
                </div>
                {place(o) && (
                  <div className="text-xs text-muted-foreground">
                    {place(o)} {o.shipTo?.pincode}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{itemsSummary(o)}</div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{formatINR(o.totalPaise)}</span>
                  <span className="flex items-center gap-2 text-sm">
                    {paymentMethodLabel(o.payment)} <PaymentBadge status={o.paymentStatus} />
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatIstDate(o.createdAt)}, {formatIstTime(o.createdAt)}
                  </span>
                  <span className={d.overdue ? "font-medium text-destructive" : ""}>
                    {d.text}
                    {o.deliveredAt ? `, took ${tookLabel(o.createdAt, o.deliveredAt)}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <Pager always page={list.page} pages={pages} onPage={(p) => set({ page: String(p) })} summary={`Showing ${first}-${last} of ${list.totalCount}`} />
    </>
  );
};
