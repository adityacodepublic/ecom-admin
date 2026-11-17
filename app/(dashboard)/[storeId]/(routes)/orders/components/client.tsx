"use client";

import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PaymentBadge,
  StatusBadge,
  paymentMethodLabel,
} from "@/components/orders/status-badge";
import { formatINR } from "@/lib/money";
import {
  deliveryLabel,
  formatDay,
  formatIstDate,
  formatIstTime,
} from "@/lib/format-date";
import type { AdminOrderList, AdminOrderSummary } from "@/lib/orders/queries";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/orders/status";

type Filters = {
  status: string;
  paymentStatus: string;
  q: string;
  from: string;
  to: string;
};

const itemsSummary = (o: AdminOrderSummary) => {
  const names = o.itemNames.join(", ");
  const short = names.length > 60 ? `${names.slice(0, 57)}...` : names;
  return `${short || "No items"}${o.itemCount > 1 ? ` (${o.itemCount} items)` : ""}`;
};
const customerName = (o: AdminOrderSummary) =>
  o.shipTo?.name || o.customer?.fname || "Unknown";
const customerPhone = (o: AdminOrderSummary) =>
  o.shipTo?.phone || o.customer?.phone || "";

export const OrdersClient = ({
  list,
  filters,
}: {
  list: AdminOrderList;
  filters: Filters;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { storeId } = useParams<{ storeId: string }>();

  /** The URL with some filters changed. Any filter change goes back to page 1. */
  const hrefWith = (changes: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (!("page" in changes)) sp.delete("page");
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const go = (changes: Record<string, string>) =>
    router.push(hrefWith(changes));

  // The search box: typing waits a moment, then the URL changes (the list is read on the server, page by page).
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const t = setTimeout(() => go({ q: search.trim() }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const allCount = Object.values(list.counts).reduce((n, c) => n + c, 0);
  const pages = Math.max(1, Math.ceil(list.totalCount / list.pageSize));
  const first = list.totalCount === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.page * list.pageSize, list.totalCount);
  const hasFilters = !!(
    filters.status ||
    filters.paymentStatus ||
    filters.q ||
    filters.from ||
    filters.to
  );
  const orderHref = (o: AdminOrderSummary) =>
    `/${storeId}/orders/${o.orderNumber}`;

  const Delivery = ({ o }: { o: AdminOrderSummary }) => {
    const d = deliveryLabel(o.expectedDelivery, o.status, list.steps);
    return (
      <div>
        <div className={d.overdue ? "font-medium text-destructive" : ""}>
          {d.text}
        </div>
        {o.expectedDelivery && (
          <div className="text-xs text-muted-foreground">
            {formatDay(o.expectedDelivery)}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Heading
        title={`Orders (${allCount})`}
        description="Manage orders for your store"
      />
      <Separator />

      {/* Search, then the filters below it */}
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search orders"
            placeholder="Search"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={filters.status || "ALL"}
              onValueChange={(v) => go({ status: v === "ALL" ? "" : v })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses ({allCount})</SelectItem>
                {list.statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} ({list.counts[s] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Payment</Label>
            <Select
              value={filters.paymentStatus || "ALL"}
              onValueChange={(v) => go({ paymentStatus: v === "ALL" ? "" : v })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All payments</SelectItem>
                {PAYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PAYMENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="from"
              type="date"
              className="w-40 dark:[color-scheme:dark]"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => go({ from: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="to"
              type="date"
              className="w-40 dark:[color-scheme:dark]"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => go({ to: e.target.value })}
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                go({ status: "", paymentStatus: "", q: "", from: "", to: "" })
              }
            >
              <X className="mr-1 h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {list.orders.length === 0 ? (
        <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
          {filters.q
            ? `No orders match "${filters.q}".`
            : "No orders match these filters."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.orders.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => router.push(orderHref(o))}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={orderHref(o)}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        #{o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{formatIstDate(o.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatIstTime(o.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{customerName(o)}</div>
                      <div className="text-xs text-muted-foreground">
                        {customerPhone(o)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {itemsSummary(o)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">
                      {formatINR(o.totalPaise)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-sm">
                          {paymentMethodLabel(o.payment)}
                        </span>
                        <PaymentBadge status={o.paymentStatus} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={o.status} statuses={list.steps} />
                        {o.returnStatus && (
                          <span className="text-xs text-muted-foreground">
                            Return: {o.returnStatus}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Delivery o={o} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone cards */}
          <div className="grid gap-3 md:hidden">
            {list.orders.map((o) => (
              <Link
                key={o.id}
                href={orderHref(o)}
                className="block rounded-md border p-3 hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">#{o.orderNumber}</span>
                  <span className="flex items-center gap-2">
                    {o.returnStatus && (
                      <span className="text-xs text-muted-foreground">
                        Return: {o.returnStatus}
                      </span>
                    )}
                    <StatusBadge status={o.status} statuses={list.steps} />
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  {customerName(o)}{" "}
                  <span className="text-muted-foreground">
                    {customerPhone(o)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {itemsSummary(o)}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{formatINR(o.totalPaise)}</span>
                  <span className="flex items-center gap-2 text-sm">
                    {paymentMethodLabel(o.payment)}{" "}
                    <PaymentBadge status={o.paymentStatus} />
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatIstDate(o.createdAt)}, {formatIstTime(o.createdAt)}
                  </span>
                  <span
                    className={
                      deliveryLabel(o.expectedDelivery, o.status, list.steps)
                        .overdue
                        ? "font-medium text-destructive"
                        : ""
                    }
                  >
                    {
                      deliveryLabel(o.expectedDelivery, o.status, list.steps)
                        .text
                    }
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Pages */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Showing {first}-{last} of {list.totalCount}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={list.page <= 1}
            onClick={() => go({ page: String(list.page - 1) })}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <span>
            Page {list.page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={list.page >= pages}
            onClick={() => go({ page: String(list.page + 1) })}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
};
