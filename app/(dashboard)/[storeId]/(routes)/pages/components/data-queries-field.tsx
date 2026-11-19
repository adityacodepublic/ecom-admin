"use client";

import { Info, Plus, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { useController } from "react-hook-form";
import type { AutoFormFieldProps } from "@autoform/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOM_DATA_NAME, type DataQuery, type PageName } from "@/lib/home-layout";

export interface Option {
  value: string;
  label: string;
}

// ---------------------------------------------------------------- the HTML box

/** A code box for AutoForm fields with fieldType "code" (the HTML of a custom component). */
export const CodeField = ({ id, error, inputProps }: AutoFormFieldProps) => {
  const { field } = useController({ name: id });
  return (
    <textarea
      id={id}
      rows={12}
      spellCheck={false}
      className={`w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${error ? "border-destructive" : "border-input"}`}
      {...inputProps}
      {...field}
      value={field.value ?? ""}
    />
  );
};

// ---------------------------------------------------------------- the data editor

type Source = DataQuery["source"];
const SOURCE_LABEL: Record<Source, string> = { products: "Products", categories: "Categories" };
const NONE = "__none";

type Row = { key: number; name: string; query: DataQuery };

/** The rows as the stored object. Two rows with the same name: the later one keeps its last good name (the row shows the error). */
const toRecord = (rows: Row[], dupes: Set<number>, lastGood: Map<number, string>) => {
  const out: Record<string, DataQuery> = {};
  for (const r of rows) out[dupes.has(r.key) ? (lastGood.get(r.key) ?? r.name) : r.name] = r.query;
  return out;
};

const emptyQuery = (source: Source): DataQuery =>
  source === "products" ? { source, featuredOnly: false, limit: 12 } : ({ source } as DataQuery);

/** Item fields of each source: what the HTML finds in STORE_DATA.<name>. */
const DataHelp = ({ page }: { page: PageName }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="What does each item contain?"
        className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(30rem,90vw)] space-y-2 text-xs">
      <p>
        Each name becomes a list in the HTML: <code>STORE_DATA.&lt;name&gt;</code>. <code>STORE_DATA.store</code> (name, home) is always there.
        {page === "category" && (
          <>
            {" "}
            On this page <code>STORE_DATA.category</code> is the category being shown (id, name, image, url).
          </>
        )}
        {page === "product" && (
          <>
            {" "}
            On this page <code>STORE_DATA.product</code> is the product being shown (same fields as a product below).
          </>
        )}
      </p>
      <p>
        <b>Products</b>: <code>id, name, price, priceText, image, images[], url, category {"{"}id, name{"}"}, featured, inStock, quantity, description</code>
      </p>
      <p>
        <b>Categories</b>: <code>id, name, image, url</code>
      </p>
      <p className="text-muted-foreground">Search works like the store search box ("under 2000", "phone"). Names: letters, digits and _ . About 200 KB of data in total.</p>
    </PopoverContent>
  </Popover>
);

/**
 * The Data field of a custom component, as AutoForm fieldType "dataQueries": one row per named query, with the
 * options that fit its source (categories come from the store, so the picker is always valid). It writes the
 * object the schema expects: { "<name>": { source, ...options } }.
 */
export const dataQueriesField = (categories: Option[], page: PageName = "home") => {
  const DataQueriesField = ({ id }: AutoFormFieldProps) => {
    const { field } = useController({ name: id });
    const nextKey = useRef(0);
    const [rows, setRows] = useState<Row[]>(() =>
      Object.entries((field.value ?? {}) as Record<string, DataQuery>).map(([name, query]) => ({ key: nextKey.current++, name, query })),
    );
    const lastGood = useRef(new Map<number, string>());

    const duplicates = (list: Row[]) => {
      const seen = new Set<string>();
      const dupes = new Set<number>();
      for (const r of list) (seen.has(r.name) ? dupes.add(r.key) : seen.add(r.name));
      return dupes;
    };

    const commit = (next: Row[]) => {
      const dupes = duplicates(next);
      for (const r of next) if (!dupes.has(r.key)) lastGood.current.set(r.key, r.name);
      setRows(next);
      field.onChange(toRecord(next, dupes, lastGood.current));
    };

    const update = (key: number, patch: Partial<Row>) => commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const updateQuery = (key: number, patch: Record<string, unknown>) =>
      commit(
        rows.map((r) => {
          if (r.key !== key) return r;
          const merged: Record<string, unknown> = { ...r.query, ...patch };
          for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === "") delete merged[k];
          return { ...r, query: merged as DataQuery };
        }),
      );

    const add = () => {
      let n = 1;
      const names = new Set(rows.map((r) => r.name));
      while (names.has(n === 1 ? "products" : `products${n}`)) n++;
      commit([...rows, { key: nextKey.current++, name: n === 1 ? "products" : `products${n}`, query: emptyQuery("products") }]);
    };

    const dupes = duplicates(rows);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            Each name is available in the HTML as <code>STORE_DATA.&lt;name&gt;</code>
          </span>
          <DataHelp page={page} />
        </div>

        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data yet. The HTML can only use STORE_DATA.store.</p>}

        {rows.map((r) => {
          const q = r.query as Record<string, any>;
          const nameError = dupes.has(r.key) ? "This name is already used." : !CUSTOM_DATA_NAME.test(r.name) ? "Letters, digits and _ only; start with a letter." : r.name === "store" ? '"store" is reserved.' : "";
          return (
            <div key={r.key} className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-start">
                <div className="grid gap-1">
                  <Label htmlFor={`${id}-${r.key}-name`} className="text-xs">
                    Name
                  </Label>
                  <Input id={`${id}-${r.key}-name`} aria-label="Data name" placeholder="e.g. deals" value={r.name} className={nameError ? "border-destructive" : ""} onChange={(e) => update(r.key, { name: e.target.value })} />
                  {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Source</Label>
                  <Select value={r.query.source} onValueChange={(v) => update(r.key, { query: emptyQuery(v as Source) })}>
                    <SelectTrigger aria-label="Data source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SOURCE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" size="icon" variant="outline" className="sm:mt-[1.375rem]" aria-label="Remove data" onClick={() => commit(rows.filter((x) => x.key !== r.key))}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>

              {r.query.source === "products" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={q.categoryId || NONE} onValueChange={(v) => updateQuery(r.key, { categoryId: v === NONE ? undefined : v })}>
                      <SelectTrigger aria-label="Category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Any category</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">How many (1 to 50)</Label>
                    <Input type="number" min={1} max={50} value={q.limit ?? 12} onChange={(e) => updateQuery(r.key, { limit: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Search words (optional)</Label>
                    <Input placeholder='e.g. "under 2000" or "phone"' value={q.search ?? ""} onChange={(e) => updateQuery(r.key, { search: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-2 pb-2">
                    <Checkbox id={`${id}-${r.key}-featured`} checked={!!q.featuredOnly} onCheckedChange={(v) => updateQuery(r.key, { featuredOnly: v === true })} />
                    <Label htmlFor={`${id}-${r.key}-featured`}>Featured products only</Label>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-2 h-4 w-4" /> Add data
        </Button>
      </div>
    );
  };
  return DataQueriesField;
};
