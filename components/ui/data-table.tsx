"use client";

import { useState } from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChips } from "@/components/ui/column-filter";
import { Pager } from "@/components/ui/pager";
import { describeFilter } from "@/components/ui/data-table-filters";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Column the built-in search box filters. Leave it out to hide the box (the page searches on the server). */
  searchKey?: string;
  /**
   * Fixed column widths: every column takes exactly its size (give the columns a `size`), long text is cut with "...",
   * and dragging a column edge widens or narrows just that column. Without it the browser sizes the columns by their text.
   */
  fixedLayout?: boolean;
  /** Rows per page in the browser. A page that already pages on the server passes its own page size. */
  pageSize?: number;
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Keep the column at the right edge while the table scrolls sideways (a column of row buttons). */
    pinned?: "right";
    /** The filter's name in the chips above the table (see ./data-table-filters). */
    filterLabel?: string;
    /** How a chip says the filter value. */
    formatFilter?: (value: unknown) => string;
  }
}

const pinnedClass = "sticky -inset-1 z-10 border-l border-border/40 bg-background px-1 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]";

/**
 * A table of rows held in the browser: optional search, column-title filters (see ./data-table-filters), resizable
 * columns and pages. The filters that are on show as chips above the table.
 */
export function DataTable<TData, TValue>({ columns, data, searchKey, fixedLayout = false, pageSize = 10 }: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    onColumnFiltersChange: setColumnFilters,
    state: { columnFilters },
    initialState: { pagination: { pageIndex: 0, pageSize } },
    defaultColumn: { minSize: fixedLayout ? 60 : 0 },
  });

  const pinned = (c: Column<TData, unknown>) => c.columnDef.meta?.pinned === "right";
  // A column takes its own width once it has one (fixed layout, a size, or a drag); otherwise the browser sizes it.
  const sized = (c: Column<TData, unknown>) => fixedLayout || c.columnDef.size !== undefined || c.getIsResizing() || c.id in table.getState().columnSizing;
  const width = (c: Column<TData, unknown>) => (pinned(c) ? { width: c.columnDef.size ?? 50 } : sized(c) ? { width: c.getSize() } : undefined);

  const chips = columnFilters
    .filter((f) => f.id !== searchKey)
    .map((f) => {
      const meta = table.getColumn(f.id)?.columnDef.meta;
      return { id: f.id, label: `${meta?.filterLabel ?? f.id}: ${describeFilter(f.value, meta?.formatFilter)}`, onRemove: () => table.getColumn(f.id)?.setFilterValue(undefined) };
    });
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      {searchKey && (
        <Input
          placeholder="Search"
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn(searchKey)?.setFilterValue(e.target.value)}
          className="max-w-sm"
        />
      )}
      {chips.length > 0 && (
        <FilterChips chips={chips}>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setColumnFilters((all) => all.filter((f) => f.id === searchKey))}>
            <X className="mr-1 h-4 w-4" /> Clear filters
          </Button>
        </FilterChips>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table className={fixedLayout ? "" : "w-auto min-w-full"} style={fixedLayout ? { width: table.getTotalSize(), minWidth: "100%", tableLayout: "fixed" } : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={cn("relative select-none whitespace-nowrap", pinned(header.column) && pinnedClass)} style={width(header.column)}>
                    {!header.isPlaceholder && flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() && (
                      <div
                        aria-hidden
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none border-r hover:bg-primary/30",
                          header.column.getIsResizing() && "bg-primary/60",
                        )}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-12 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => {
                  const c = cell.column;
                  const value = cell.getValue();
                  // A sized column cuts long text with "..." (the full text shows on hover).
                  const cut = !pinned(c) && sized(c);
                  return (
                    <TableCell key={cell.id} className={cn("whitespace-nowrap", pinned(c) && pinnedClass)} style={cut ? { width: c.getSize(), maxWidth: c.getSize() } : width(c)}>
                      <div
                        className={cn(cut && "truncate")}
                        style={cut ? { maxWidth: c.getSize() - 32 } : undefined}
                        title={!pinned(c) && typeof value === "string" ? value : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={table.getState().pagination.pageIndex + 1} pages={table.getPageCount()} onPage={(p) => table.setPageIndex(p - 1)} />
    </div>
  );
}
