"use client"

import { ColumnDef } from "@tanstack/react-table"

export type OrderColumn = {
  id: string;
  phone: string;
  address: string;
  isPaid: boolean;
  totalPrice: string;
  products: string;
  createdAt: string;
  email: string;
}

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: "products",
    header: "Products",
    // cell: ({ row }) => (
    //   <div className="flex items-center gap-x-2">
    //     {row.original.products. name.slice(0, 20)}{data.name.length > 20 ? `…` : ``}
    //   </div>
    // )
  },
  {
    accessorKey: "totalPrice",
    header: "Total price",
  },
  {
    accessorKey: "createdAt",
    header: "Date",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "address",
    header: "Address",
  },
  {
    accessorKey: "isPaid",
    header: "Paid",
    cell: ({ row }) => row.original.isPaid ? <span style={{ backgroundColor: '#94FF9470', borderRadius: '8.5px', padding: '4px 6px', marginLeft:"-4px" }}>true</span> : 'false',
  },
];
