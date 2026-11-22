"use client";

import { useState } from "react";

import { ClearFilter, SearchList } from "@/components/ui/column-filter";
import type { OrderFacets } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

export type Place = { state: string; city: string; pincode: string };

/**
 * Where orders were shipped: a state, a city (each city option carries its own URL filters: city + state) or a
 * pincode, picked from the places the store's orders have. `onPick` gets the URL changes; picking the current value
 * again turns it off.
 */
export const PlaceFilter = ({
  facets,
  value,
  onPick,
  note,
}: {
  facets: Pick<OrderFacets, "states" | "cities" | "pincodes">;
  value: Place;
  onPick: (changes: Partial<Place>) => void;
  note: string;
}) => {
  const [tab, setTab] = useState<keyof Place>("state");
  const city = facets.cities.find((c) => c.filter.city === value.city && c.filter.state === value.state);
  return (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted/40 p-0.5 text-xs">
        {(["state", "city", "pincode"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-sm py-1 capitalize", tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {t}
            {value[t] ? " •" : ""}
          </button>
        ))}
      </div>
      {tab === "state" && (
        <SearchList
          placeholder="Find a state"
          value={value.state}
          options={facets.states.map((s) => ({ value: s.value, label: s.value, count: s.orders }))}
          onPick={(v) => onPick({ state: v === value.state ? "" : v })}
        />
      )}
      {tab === "city" && (
        <SearchList
          placeholder="Find a city"
          value={city?.key ?? ""}
          options={facets.cities.map((c) => ({ value: c.key, label: c.label, count: c.orders }))}
          onPick={(key) => onPick(key === city?.key ? { city: "", state: "" } : facets.cities.find((c) => c.key === key)!.filter)}
        />
      )}
      {tab === "pincode" && (
        <SearchList
          placeholder="Find a pincode"
          value={value.pincode}
          options={facets.pincodes.map((p) => ({ value: p.value, label: p.value, count: p.orders }))}
          onPick={(v) => onPick({ pincode: v === value.pincode ? "" : v })}
        />
      )}
      <p className="text-xs text-muted-foreground">{note}</p>
      <ClearFilter show={!!(value.state || value.city || value.pincode)} onClear={() => onPick({ state: "", city: "", pincode: "" })} />
    </>
  );
};

/** Orders that have a product, picked from the products the store's orders have. */
export const ProductFilter = ({ products, value, onPick, note }: { products: OrderFacets["products"]; value: string; onPick: (product: string) => void; note: string }) => (
  <>
    <SearchList
      placeholder="Find a product"
      value={value}
      options={products.map((p) => ({ value: p.id, label: p.name, count: p.orders }))}
      onPick={(v) => onPick(v === value ? "" : v)}
    />
    <p className="text-xs text-muted-foreground">{note}</p>
    <ClearFilter show={!!value} onClear={() => onPick("")} />
  </>
);
