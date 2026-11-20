"use client"

import { ColumnDef, Cell } from "@tanstack/react-table"
import { Copy } from "lucide-react"
import { toast } from "react-hot-toast"

import { Button } from "@/components/ui/button"


export type UserColumn = {
  id: string; // the sign-in id: the store sends it to Clarity as the visitor's custom user ID
  fname:string;
  email: string;
  phone: string;
  address: string;
  totalPrice: string; // rupees with paise, exact (e.g. "309.97")
  products:string;
  imgurl:string;
  orderCount: number;
  
}

export const columns: ColumnDef<UserColumn>[] = [
  {
    accessorKey: "fname",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center">
        <img src={row.original.imgurl} alt={row.original.fname} className="rounded-full mr-2 w-7 h-7 border border-slate-grey" />
        {row.original.fname}
      </div>
    ),
  },
  {
    accessorKey: "orderCount",
    header: "Orders",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "address",
    header: "Address",
  },
  {
    accessorKey: "totalPrice",
    header: "Paid purchases",
    cell: ({ row }) => (
      <div className="flex items-center">
        <p>&#8377;</p>{row.original.totalPrice}
      </div>
    ),
  },
  {
    accessorKey: "products",
    header: "Products",
  },



];

// Only when the store has Clarity connected: copy this customer's Clarity ID, then paste it into Clarity's
// Filters > Custom filters > Custom user ID to see only this customer's recordings and visits.
export const clarityColumn: ColumnDef<UserColumn> = {
  id: "clarity",
  header: "Clarity ID",
  cell: ({ row }) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(row.original.id);
        toast.success("Clarity ID copied. Paste it in Clarity > Filters > Custom user ID.");
      }}
    >
      <Copy className="mr-2 h-3.5 w-3.5" /> Copy
    </Button>
  ),
};
