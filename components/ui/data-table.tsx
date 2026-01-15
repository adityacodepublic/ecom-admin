"use client";

import { useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnResizeMode,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnResizeMode] = useState<ColumnResizeMode>("onChange");

  const table = useReactTable({
    data,
    columns,
    columnResizeMode,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      columnFilters,
    },
    defaultColumn: {
      minSize: 0,
    },
  });

  return (
    <div>
      <div className="flex items-center pb-4">
        <Input
          placeholder="Search"
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn(searchKey)?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table className="w-auto min-w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isActionsColumn = header.id === "actions";
                  const isResized =
                    header.column.getIsResizing() || header.getSize() !== 150;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "relative select-none whitespace-nowrap",
                        isActionsColumn &&
                          "sticky -inset-1 bg-background border-l-[1px] border-border/40 z-10 px-1 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                      )}
                      style={
                        isResized && !isActionsColumn
                          ? {
                              width: header.getSize(),
                            }
                          : isActionsColumn
                          ? {
                              width: 50,
                            }
                          : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {/* Resizer handle */}
                      {!isActionsColumn && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                            "hover:bg-primary/30",
                            "border-r",
                            header.column.getIsResizing() && "bg-primary/60"
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isActionsColumn = cell.column.id === "actions";
                    const isResized =
                      cell.column.getIsResizing() ||
                      cell.column.getSize() !== 150;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "whitespace-nowrap",
                          isActionsColumn &&
                            "sticky -inset-1 bg-background border-l z-10 px-1 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                        )}
                        style={
                          isResized && !isActionsColumn
                            ? {
                                width: cell.column.getSize(),
                                maxWidth: cell.column.getSize(),
                              }
                            : isActionsColumn
                            ? {
                                width: 50,
                              }
                            : undefined
                        }
                      >
                        <div
                          className={cn(
                            !isActionsColumn && isResized && "truncate"
                          )}
                          style={
                            isResized && !isActionsColumn
                              ? {
                                  maxWidth: cell.column.getSize() - 32,
                                }
                              : undefined
                          }
                          title={
                            !isActionsColumn &&
                            typeof cell.getValue() === "string"
                              ? (cell.getValue() as string)
                              : undefined
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-12 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
