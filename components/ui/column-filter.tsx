"use client";

import { useState } from "react";
import { Check, ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The filter of one table column. In the table it is the column title (click it to filter); on phones, where there
 * is no table header, the same filter is a button above the list. A blue mark shows the filter is on.
 */
export const ColumnFilter = ({
  label,
  active,
  variant = "header",
  align = "start",
  children,
}: {
  label: string;
  active: boolean;
  variant?: "header" | "button";
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${active ? "filtered. Change the filter" : "filter"}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground",
            variant === "header" ? "-ml-2 h-8 px-2" : "h-8 border px-2.5 text-xs",
            active && "text-foreground",
            active && variant === "button" && "border-blue-500/40 bg-blue-500/10",
          )}
        >
          {label}
          <ListFilter className={cn("h-3.5 w-3.5", active ? "text-blue-500" : "opacity-40")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 space-y-3 p-3">
        <p className="text-xs font-medium text-muted-foreground">Filter by {label.toLowerCase()}</p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
};

export type Option = { value: string; label: React.ReactNode; count?: number };

const Tick = ({ on }: { on: boolean }) => <Check className={cn("h-3.5 w-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} aria-hidden />;

/** A short list where one value is picked ("" = all). */
export const OptionList = ({ options, value, onPick }: { options: Option[]; value: string; onPick: (v: string) => void }) => (
  <div role="listbox" className="max-h-64 space-y-0.5 overflow-y-auto">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="option"
        aria-selected={value === o.value}
        onClick={() => onPick(o.value)}
        className={cn("flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", value === o.value && "bg-accent/60 font-medium")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Tick on={value === o.value} />
          <span className="truncate">{o.label}</span>
        </span>
        {o.count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count}</span>}
      </button>
    ))}
  </div>
);

/** A long list with a search box (places, products). */
export const SearchList = ({
  placeholder,
  options,
  value,
  onPick,
}: {
  placeholder: string;
  options: (Option & { label: string })[];
  value: string;
  onPick: (v: string) => void;
}) => (
  <Command className="rounded-md border">
    <CommandInput placeholder={placeholder} />
    <CommandList className="max-h-56">
      <CommandEmpty>Nothing found.</CommandEmpty>
      {options.map((o) => (
        <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => onPick(o.value)} className="gap-2">
          <Tick on={value === o.value} />
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          {o.count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count}</span>}
        </CommandItem>
      ))}
    </CommandList>
  </Command>
);

/** "Clear" under a filter. */
export const ClearFilter = ({ show, onClear }: { show: boolean; onClear: () => void }) =>
  show ? (
    <button type="button" onClick={onClear} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
      Clear this filter
    </button>
  ) : null;

/**
 * A number range, typed then applied ("" = no bound). Its fields start from the applied values each time the filter
 * opens (the popover mounts it then), so it needs no syncing.
 */
export const RangeFilter = ({
  id,
  unit,
  from,
  to,
  onApply,
}: {
  id: string; // prefix for the field ids
  unit?: string; // shown in the labels, e.g. "₹"
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) => {
  const [min, setMin] = useState(from);
  const [max, setMax] = useState(to);
  const error = min && max && Number(min) > Number(max) ? "The lowest is more than the highest." : "";
  const suffix = unit ? ` (${unit})` : "";
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onApply(min.trim(), max.trim());
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${id}-min`} className="text-xs text-muted-foreground">
            From{suffix}
          </label>
          <Input id={`${id}-min`} type="number" min={0} step="any" inputMode="decimal" className="h-8" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-max`} className="text-xs text-muted-foreground">
            Up to{suffix}
          </label>
          <Input id={`${id}-max`} type="number" min={0} step="any" inputMode="decimal" className="h-8" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <ClearFilter show={!!(from || to)} onClear={() => onApply("", "")} />
        <Button type="submit" size="sm" className="ml-auto h-7" disabled={!!error}>
          Apply
        </Button>
      </div>
    </form>
  );
};

export type Chip = { id: string; label: string; onRemove: () => void };

/** Every filter that is on, in words, each with its own remove button. `children` goes after them (notes, hints). */
export const FilterChips = ({ chips, children }: { chips: Chip[]; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2 text-sm">
    {chips.map((c) => (
      <span key={c.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-3 pr-1">
        {c.label}
        <button type="button" aria-label={`Remove filter: ${c.label}`} className="rounded-full p-1 hover:bg-accent" onClick={c.onRemove}>
          <X className="h-3 w-3" />
        </button>
      </span>
    ))}
    {children}
  </div>
);
