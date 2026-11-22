"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerRow } from "@/lib/customers";
import { formatINR, toPaise } from "@/lib/money";

export type UserColumn = CustomerRow;

type FilterColumn = "orderCount" | "address" | "totalPrice" | "products";
/** Column titles that are filters (made by the page, which keeps the filters in the URL). Others are plain text. */
export type CustomerFilterHeaders = Partial<Record<FilterColumn, React.ReactNode>>;

// The titles come through context, so the columns below stay the same objects on every render: a header function
// made per render would be a new component each time and close an open filter.
const FilterHeadersContext = createContext<CustomerFilterHeaders>({});
export const CustomerFilterHeadersProvider = FilterHeadersContext.Provider;
const Title = ({ column, text }: { column: FilterColumn; text: string }) => <>{useContext(FilterHeadersContext)[column] ?? text}</>;

/** The number of orders, as a link to this customer's orders on the Orders page. */
const OrdersLink = ({ customerId, count }: { customerId: string; count: number }) => {
  const { storeId } = useParams<{ storeId: string }>();
  return (
    <Link href={`/${storeId}/orders?buyer=${encodeURIComponent(customerId)}`} className="underline underline-offset-2 hover:text-foreground" title="See this customer's orders">
      {count}
    </Link>
  );
};

// Fixed widths (the table uses fixedLayout): long text is cut with "..." and the column edge can be dragged wider.
export const customerColumns: ColumnDef<UserColumn>[] = [
  {
    accessorKey: "fname",
    header: "Name",
    size: 180,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center">
        <img src={row.original.imgurl} alt={row.original.fname} className="mr-2 h-7 w-7 shrink-0 rounded-full border border-slate-grey" />
        <span className="truncate">{row.original.fname}</span>
      </div>
    ),
  },
  {
    accessorKey: "orderCount",
    header: () => <Title column="orderCount" text="Orders" />,
    size: 90,
    cell: ({ row }) => <OrdersLink customerId={row.original.id} count={row.original.orderCount} />,
  },
  { accessorKey: "email", header: "Email", size: 220 },
  { accessorKey: "phone", header: "Phone", size: 160 },
  { accessorKey: "address", header: () => <Title column="address" text="Address" />, size: 250 },
  { accessorKey: "totalPrice", header: () => <Title column="totalPrice" text="Paid purchases" />, size: 150, cell: ({ row }) => formatINR(toPaise(row.original.totalPrice)) },
  { accessorKey: "products", header: () => <Title column="products" text="Products" />, size: 240 },
];

/** The Clarity actions for one customer, in a dialog opened from the "..." button. */
const ClarityActions = ({ user, projectId }: { user: UserColumn; projectId: string }) => {
  const [open, setOpen] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(user.id);
    toast.success("Clarity ID copied.");
  };
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(true)} aria-label={`Clarity options for ${user.fname}`} title="Clarity">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{user.fname} in Clarity</DialogTitle>
            <DialogDescription>See this customer&apos;s recordings and visits in your Clarity project.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Copy the customer&apos;s Clarity ID.</li>
            <li>Open Clarity recordings.</li>
            <li>
              Click <span className="font-medium text-foreground">Filters</span> &gt; <span className="font-medium text-foreground">Custom user ID</span> and paste the ID.
            </li>
          </ol>
          <div className="break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">{user.id}</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copy}>
              <Copy className="mr-2 h-4 w-4" /> Copy Clarity ID
            </Button>
            <Button asChild>
              <a href={`https://clarity.microsoft.com/projects/view/${projectId}/impressions`} target="_blank" rel="noreferrer" onClick={copy}>
                <ExternalLink className="mr-2 h-4 w-4" /> Copy ID and open recordings
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Only when the store has Clarity connected: the "..." button on a customer opens their Clarity options.
export const clarityColumn = (projectId: string): ColumnDef<UserColumn> => ({
  id: "actions",
  header: "",
  size: 50,
  enableResizing: false,
  meta: { pinned: "right" },
  cell: ({ row }) => <ClarityActions user={row.original} projectId={projectId} />,
});
