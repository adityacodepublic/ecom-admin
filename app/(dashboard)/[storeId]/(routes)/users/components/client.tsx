"use client";

import { useParams } from "next/navigation";
import { use, useMemo } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ColumnFilter, FilterChips, OptionList, RangeFilter, type Chip } from "@/components/ui/column-filter";
import { DataTable } from "@/components/ui/data-table";
import { Pager } from "@/components/ui/pager";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PlaceFilter, ProductFilter, WithOrderFacets } from "@/components/orders/order-facet-filters";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { CUSTOMER_FILTER_KEYS, type CustomerListQuery } from "@/lib/customer-query";
import type { CustomerRow } from "@/lib/customers";
import { formatRupees } from "@/lib/money";
import { cn } from "@/lib/utils";

import { clarityColumn, CustomerFilterHeadersProvider, customerColumns, type CustomerFilterHeaders } from "./columns";

export type UsersData = {
  rows: CustomerRow[];
  totalCount: number;
  productName: string; // the filtered product, for its chip
  clarityProjectId: string; // when set, each customer gets a "..." button with their Clarity options
};

const ORDER_COUNTS = [
  { value: "", label: "Any" },
  { value: "1", label: "One order" },
  { value: "2+", label: "2 or more (repeat buyers)" },
  { value: "5+", label: "5 or more" },
];
const str = (v: string | number | undefined) => (v === undefined ? "" : String(v));

interface UserClientProps {
  data: Promise<UsersData>; // started on the server and not awaited there: read here with use(), inside the page's <Suspense>
  query: CustomerListQuery; // the filters and page, as read from the URL
  pageSize: number;
}

export const UserClient: React.FC<UserClientProps> = ({ data: promise, query: f, pageSize }) => {
  const { rows, totalCount, productName, clarityProjectId } = use(promise);
  const { storeId } = useParams<{ storeId: string }>();
  const { set, clear, pending } = useUrlFilters();
  const [search, setSearch] = useDebouncedSearch(f.q ?? "", (q) => set({ q }));
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const columns = useMemo(() => (clarityProjectId ? [...customerColumns, clarityColumn(clarityProjectId)] : customerColumns), [clarityProjectId]);
  const pick = (changes: Record<string, string>, close: () => void) => {
    set(changes);
    close();
  };

  // The column titles that filter. The filters run on the server over every customer, not just this page.
  const headers: CustomerFilterHeaders = {
    orderCount: (
      <ColumnFilter label="Orders" active={!!f.orders}>
        {(close) => <OptionList value={f.orders ?? ""} options={ORDER_COUNTS} onPick={(orders) => pick({ orders }, close)} />}
      </ColumnFilter>
    ),
    address: (
      <ColumnFilter label="Address" active={!!(f.state || f.city || f.pincode)}>
        {(close) => (
          <WithOrderFacets storeId={storeId}>
            {(facets) => (
              <PlaceFilter
                facets={facets}
                value={{ state: f.state ?? "", city: f.city ?? "", pincode: f.pincode ?? "" }}
                onPick={(changes) => pick(changes, close)}
                note="Customers who had an order shipped there (cancelled orders left out). Counts are orders."
              />
            )}
          </WithOrderFacets>
        )}
      </ColumnFilter>
    ),
    totalPrice: (
      <ColumnFilter label="Paid purchases" active={f.minPaid !== undefined || f.maxPaid !== undefined}>
        {(close) => <RangeFilter id="paid" unit="₹" from={str(f.minPaid)} to={str(f.maxPaid)} onApply={(minPaid, maxPaid) => pick({ minPaid, maxPaid }, close)} />}
      </ColumnFilter>
    ),
    products: (
      <ColumnFilter label="Products" active={!!f.product} align="end">
        {(close) => (
          <WithOrderFacets storeId={storeId}>
            {(facets) => (
              <ProductFilter
                products={facets.products}
                value={f.product ?? ""}
                onPick={(product) => pick({ product }, close)}
                note="Customers who ordered it (cancelled orders left out). Counts are orders."
              />
            )}
          </WithOrderFacets>
        )}
      </ColumnFilter>
    ),
  };

  const chip = (key: keyof CustomerListQuery, label: string): Chip | null => (f[key] !== undefined && key !== "q" ? { id: key, label, onRemove: () => set({ [key]: "" }) } : null);
  const chips = [
    chip("orders", `Orders: ${ORDER_COUNTS.find((o) => o.value === f.orders)?.label}`),
    chip("minPaid", `Paid from ${formatRupees(f.minPaid ?? 0)}`),
    chip("maxPaid", `Paid up to ${formatRupees(f.maxPaid ?? 0)}`),
    chip("state", `State: ${f.state}`),
    chip("city", `City: ${f.city}`),
    chip("pincode", `Pincode: ${f.pincode}`),
    chip("product", `Bought: ${productName || "a product"}`),
  ].filter((c): c is Chip => c !== null);

  return (
    <>
      <Heading title={`Customers (${totalCount})`} description="People who ordered from your store. Customers are never deleted. Click a column title to filter by it." />
      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" aria-label="Search customers" />
        {(f.q || chips.length > 0) && (
          <Button variant="ghost" size="sm" onClick={() => clear(CUSTOMER_FILTER_KEYS)}>
            <X className="mr-1 h-4 w-4" /> Clear filters
          </Button>
        )}
      </div>
      {chips.length > 0 && <FilterChips chips={chips} />}
      <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
        <CustomerFilterHeadersProvider value={headers}>
          <DataTable fixedLayout pageSize={pageSize} columns={columns} data={rows} />
        </CustomerFilterHeadersProvider>
      </div>
      <Pager page={f.page} pages={pages} onPage={(p) => set({ page: String(p) })} />
    </>
  );
};
