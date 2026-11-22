"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClearFilter, OptionList, RangeFilter, type Chip } from "@/components/ui/column-filter";
import { PlaceFilter, ProductFilter } from "@/components/orders/order-facet-filters";
import { formatDay } from "@/lib/format-date";
import { formatRupees } from "@/lib/money";
import { hourLabel, hourRangeLabel, WEEKDAYS } from "@/lib/shop-time";
import type { OrderFilters } from "@/lib/orders/list-query";
import type { AdminOrderList, OrderFacets } from "@/lib/orders/queries";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/** One column's filter: its title, whether it is on, and what its popover holds (`close` shuts the popover). */
export type ColumnFilterDef = { key: string; label: string; active: boolean; align?: "start" | "end"; body: (close: () => void) => React.ReactNode };

const toggle = (current: string, v: string) => (current === v ? "" : v);

/**
 * The filter of every Orders column, and the chips for the filters that are on. Each filter writes the URL through
 * `set` (the page reads the list on the server for it). `search`/`setSearch` are the page's search box.
 */
export function orderColumnFilters({
  filters: f,
  list,
  facets,
  buyerName,
  set,
  search,
  setSearch,
}: {
  filters: OrderFilters;
  list: AdminOrderList;
  facets: OrderFacets;
  buyerName: string;
  set: (changes: Record<string, string>) => void;
  search: string;
  setSearch: (text: string) => void;
}) {
  const finalStatus = list.steps[list.steps.length - 1];
  const allCount = Object.values(list.counts).reduce((n, c) => n + c, 0);
  const deliveryOptions = [
    { value: "", label: "Any" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Due today" },
    { value: "upcoming", label: "Due later" },
    { value: "nodate", label: "No delivery date set" },
    { value: "delivered", label: `${finalStatus} (delivered)` },
  ];
  const pick = (changes: Record<string, string>, close: () => void) => {
    set(changes);
    close();
  };
  const choice = (selected: boolean) => cn("rounded-sm border py-1 hover:bg-accent", selected && "border-blue-500/50 bg-blue-500/15 font-medium");

  const columns: Record<"date" | "customer" | "shipTo" | "items" | "total" | "payment" | "status" | "delivery", ColumnFilterDef> = {
    date: {
      key: "date",
      label: "Date",
      active: !!(f.from || f.to || f.hour || f.weekday),
      body: (close) => (
        <>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input id="from" type="date" className="h-8 dark:[color-scheme:dark]" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input id="to" type="date" className="h-8 dark:[color-scheme:dark]" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Weekday (India time)</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  title={d}
                  aria-pressed={f.weekday === String(i)}
                  onClick={() => set({ weekday: toggle(f.weekday, String(i)) })}
                  className={cn(choice(f.weekday === String(i)), "text-xs")}
                >
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Hour placed (India time)</p>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  title={hourRangeLabel(h)}
                  aria-pressed={f.hour === String(h)}
                  onClick={() => set({ hour: toggle(f.hour, String(h)) })}
                  className={cn(choice(f.hour === String(h)), "text-[11px]")}
                >
                  {hourLabel(h).replace(" ", "")}
                </button>
              ))}
            </div>
          </div>
          <ClearFilter show={!!(f.from || f.to || f.hour || f.weekday)} onClear={() => pick({ from: "", to: "", hour: "", weekday: "" }, close)} />
        </>
      ),
    },
    customer: {
      key: "customer",
      label: "Customer",
      active: !!(f.buyer || f.q),
      body: (close) => (
        <>
          {f.buyer && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
              <span className="truncate">Only {buyerName || "this customer"}</span>
              <button type="button" className="text-xs underline underline-offset-2" onClick={() => pick({ buyer: "" }, close)}>
                Show all
              </button>
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="customer-search" className="text-xs text-muted-foreground">
              Name, phone or email (same as the search box)
            </Label>
            <Input id="customer-search" className="h-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          </div>
        </>
      ),
    },
    shipTo: {
      key: "shipTo",
      label: "Ship to",
      active: !!(f.state || f.city || f.pincode),
      body: (close) => (
        <PlaceFilter
          facets={facets}
          value={{ state: f.state, city: f.city, pincode: f.pincode }}
          onPick={(changes) => pick(changes, close)}
          note={'Cancelled orders are left out (unless you pick a status). "Unknown" = no place saved on the order.'}
        />
      ),
    },
    items: {
      key: "items",
      label: "Items",
      active: !!f.product,
      body: (close) => (
        <ProductFilter products={facets.products} value={f.product} onPick={(product) => pick({ product }, close)} note="Orders that have this product. Counts are all orders." />
      ),
    },
    total: {
      key: "total",
      label: "Total",
      align: "end",
      active: !!(f.minTotal || f.maxTotal),
      body: (close) => <RangeFilter id="total" unit="₹" from={f.minTotal} to={f.maxTotal} onApply={(minTotal, maxTotal) => pick({ minTotal, maxTotal }, close)} />,
    },
    payment: {
      key: "payment",
      label: "Payment",
      active: !!f.paymentStatus,
      body: (close) => (
        <OptionList
          value={f.paymentStatus}
          options={[{ value: "", label: "All payments" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))]}
          onPick={(v) => pick({ paymentStatus: v }, close)}
        />
      ),
    },
    status: {
      key: "status",
      label: "Status",
      active: !!(f.status || f.returned),
      body: (close) => (
        <>
          <OptionList
            value={f.status}
            options={[{ value: "", label: "All statuses", count: allCount }, ...list.statuses.map((s) => ({ value: s, label: s, count: list.counts[s] ?? 0 }))]}
            onPick={(v) => pick({ status: v }, close)}
          />
          <label className="flex items-center gap-2 border-t pt-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={!!f.returned} onChange={(e) => set({ returned: e.target.checked ? "1" : "" })} />
            Only orders with a return
          </label>
        </>
      ),
    },
    delivery: {
      key: "delivery",
      label: "Delivery",
      align: "end",
      active: !!f.delivery,
      body: (close) => (
        <>
          <OptionList value={f.delivery} options={deliveryOptions} onPick={(v) => pick({ delivery: v }, close)} />
          <p className="text-xs text-muted-foreground">By the expected delivery day you set on each order. Cancelled orders are left out.</p>
        </>
      ),
    },
  };

  // Every filter that is on, in words. Each chip removes its own filter; the column title shows and changes it.
  const productName = facets.products.find((p) => p.id === f.product)?.name ?? "a product";
  const chip = (key: keyof OrderFilters, label: string): Chip | null => (f[key] ? { id: key, label, onRemove: () => set({ [key]: "" }) } : null);
  const chips = [
    chip("status", `Status: ${f.status}`),
    chip("returned", "Orders with a return"),
    chip("paymentStatus", `Payment: ${PAYMENT_STATUS_LABELS[f.paymentStatus as PaymentStatus] ?? f.paymentStatus}`),
    chip("from", f.from && `Placed from ${formatDay(f.from)}`),
    chip("to", f.to && `Placed until ${formatDay(f.to)}`),
    chip("hour", f.hour && `Placed ${hourRangeLabel(+f.hour)}`),
    chip("weekday", f.weekday && `Placed on ${WEEKDAYS[+f.weekday]}s`),
    chip("buyer", `Customer: ${buyerName || "unknown"}`),
    chip("state", `State: ${f.state}`),
    chip("city", `City: ${f.city}`),
    chip("pincode", `Pincode: ${f.pincode}`),
    chip("product", `Item: ${productName}`),
    chip("minTotal", f.minTotal && `Total from ${formatRupees(f.minTotal)}`),
    chip("maxTotal", f.maxTotal && `Total up to ${formatRupees(f.maxTotal)}`),
    chip("delivery", `Delivery: ${deliveryOptions.find((d) => d.value === f.delivery)?.label}`),
  ].filter((c): c is Chip => c !== null);

  return { columns, chips };
}
