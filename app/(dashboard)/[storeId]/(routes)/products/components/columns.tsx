"use client";

import { ColumnDef } from "@tanstack/react-table";

import { byOption, byRange, yesNo } from "@/components/ui/data-table-filters";

import { CellAction } from "./cell-action";

export type ProductColumn = {
  id: string;
  name: string;
  price: string; // formatted, for the cell
  priceRupees: number; // for the price filter
  category: string;
  isFeatured: boolean;
  isArchived: boolean;
  quantity: number;
  filterValues: Record<string, string>; // the product's value of each store filter (e.g. "8 GB"), by filter id
};

type StoreFilter = { id: string; name: string };

const yesNoCell =
  (key: "isArchived" | "isFeatured") =>
  ({ row }: { row: { original: ProductColumn } }) =>
    row.original[key] ? "Yes" : "No";

/**
 * The products table: what an owner checks most (category, price, stock, featured, archived), then the store's own
 * filters (RAM, size...). Every column but the name (searched by the box) filters from its title.
 */
export function productColumns(storeFilters: StoreFilter[]): ColumnDef<ProductColumn>[] {
  return [
    { accessorKey: "name", header: "Name", size: 300 },
    { accessorKey: "category", ...byOption<ProductColumn>("Category") },
    { accessorKey: "priceRupees", cell: ({ row }) => row.original.price, ...byRange<ProductColumn>("Price", "₹") },
    { accessorKey: "quantity", ...byRange<ProductColumn>("Stock") },
    { accessorKey: "isFeatured", cell: yesNoCell("isFeatured"), ...byOption<ProductColumn>("Featured", yesNo) },
    { accessorKey: "isArchived", cell: yesNoCell("isArchived"), ...byOption<ProductColumn>("Archived", yesNo) },
    ...storeFilters.map((f): ColumnDef<ProductColumn> => ({
      id: `filter-${f.id}`,
      accessorFn: (p) => p.filterValues[f.id] ?? "",
      ...byOption<ProductColumn>(f.name, (v) => v || "Not set"),
    })),
    {
      id: "actions",
      cell: ({ row }) => <CellAction data={row.original} />,
      meta: { pinned: "right" },
      enableResizing: false,
    },
  ];
}
