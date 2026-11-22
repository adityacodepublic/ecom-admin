"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlFilters } from "@/hooks/use-url-filters";

const LABEL: Record<number, string> = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days", 365: "Last 12 months" };

/** The Insights range. It lives in the URL (?days=), so the page is read on the server for that range and can be bookmarked. */
export const RangeSelect = ({ value, options }: { value: number; options: readonly number[] }) => {
  const { set, pending } = useUrlFilters();
  return (
    <Select value={String(value)} onValueChange={(days) => set({ days })} disabled={pending}>
      <SelectTrigger className="w-44" aria-label="Insights range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {LABEL[d] ?? `Last ${d} days`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
