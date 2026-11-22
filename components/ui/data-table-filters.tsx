"use client";

import type { Column, FilterFn, HeaderContext } from "@tanstack/react-table";

import { ClearFilter, ColumnFilter, OptionList, RangeFilter, SearchList } from "@/components/ui/column-filter";

/**
 * Column-title filters for DataTable, for tables that hold all their rows in the browser (filtering happens here, not
 * on the server). Spread one into a column:
 *
 *   { accessorKey: "category", ...byOption<Product>("Category") }
 *   { accessorKey: "price", ...byRange<Product>("Price", "₹") }
 *
 * The options and the range come from the rows themselves (DataTable turns on faceting), counted with the other
 * filters applied. The column's meta names the filter in DataTable's chips.
 */

// Typed for any row, like tanstack's own filter functions, so one function serves every table.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** The row's value, as text, is the picked option. */
const optionFilter: FilterFn<any> = (row, id, value: string) => String(row.getValue(id) ?? "") === value;

/** The row's number is within [from, to]; an empty bound is open. */
const rangeFilter: FilterFn<any> = (row, id, [from, to]: [string, string]) => {
  const v = Number(row.getValue(id));
  return (from === "" || v >= Number(from)) && (to === "" || v <= Number(to));
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Yes / No for true / false values. */
export const yesNo = (v: string) => (v === "true" ? "Yes" : v === "false" ? "No" : v);

const MANY = 8; // from this many options, the list gets a search box

function OptionsHeader<T>({ column, label, display = (v) => v || "(empty)" }: { column: Column<T, unknown>; label: string; display?: (value: string) => string }) {
  const value = (column.getFilterValue() as string | undefined) ?? "";
  const options = Array.from(column.getFacetedUniqueValues(), ([v, count]) => ({ value: String(v ?? ""), label: display(String(v ?? "")), count: count as number })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  return (
    <ColumnFilter label={label} active={value !== ""}>
      {(close) => {
        const pick = (v: string) => {
          column.setFilterValue(v === "" || v === value ? undefined : v);
          close();
        };
        return options.length >= MANY ? (
          <>
            <SearchList placeholder={`Find ${label.toLowerCase()}`} value={value} options={options} onPick={pick} />
            <ClearFilter show={value !== ""} onClear={() => pick("")} />
          </>
        ) : (
          <OptionList value={value} options={[{ value: "", label: "All" }, ...options]} onPick={pick} />
        );
      }}
    </ColumnFilter>
  );
}

function RangeHeader<T>({ column, label, unit }: { column: Column<T, unknown>; label: string; unit?: string }) {
  const [from, to] = (column.getFilterValue() as [string, string] | undefined) ?? ["", ""];
  const [min, max] = column.getFacetedMinMaxValues() ?? [0, 0];
  return (
    <ColumnFilter label={label} active={from !== "" || to !== ""}>
      {(close) => (
        <>
          <p className="text-xs text-muted-foreground">
            In this list: {unit}
            {min.toLocaleString("en-IN")} to {unit}
            {max.toLocaleString("en-IN")}.
          </p>
          <RangeFilter
            id={column.id}
            unit={unit}
            from={from}
            to={to}
            onApply={(f, t) => {
              column.setFilterValue(f === "" && t === "" ? undefined : [f, t]);
              close();
            }}
          />
        </>
      )}
    </ColumnFilter>
  );
}

/** How DataTable's chip says a filter value: the column's own formatter, or the value (a range as "from – to"). */
export const describeFilter = (value: unknown, format?: (value: unknown) => string) => {
  if (format) return format(value);
  if (Array.isArray(value)) {
    const [from, to] = value as [string, string];
    return from && to ? `${from} to ${to}` : from ? `from ${from}` : `up to ${to}`;
  }
  return String(value);
};

/**
 * The parts of a column definition that make its title a filter, to spread into the column:
 *   { accessorKey: "category", ...byOption<Product>("Category") }
 */
export const byOption = <T,>(label: string, display?: (value: string) => string) => ({
  header: ({ column }: HeaderContext<T, unknown>) => <OptionsHeader column={column} label={label} display={display} />,
  filterFn: optionFilter as FilterFn<T>,
  meta: { filterLabel: label, formatFilter: display ? (v: unknown) => display(String(v)) : undefined },
});

/** As byOption, for a number column filtered by a range. */
export const byRange = <T,>(label: string, unit?: string) => ({
  header: ({ column }: HeaderContext<T, unknown>) => <RangeHeader column={column} label={label} unit={unit} />,
  filterFn: rangeFilter as FilterFn<T>,
  meta: { filterLabel: unit ? `${label} (${unit})` : label },
});
