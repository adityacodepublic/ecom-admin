"use client"

import { ColumnDef, Cell } from "@tanstack/react-table"


export type UserColumn = {
  fname:string;
  email: string;
  phone: string;
  address: string;
  totalPrice: number;
  products:string;
  imgurl:string;
  
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
    header: "Purchase",
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
