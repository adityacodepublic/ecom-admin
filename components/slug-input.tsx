"use client";

import { Input } from "@/components/ui/input";
import type { SlugHint } from "@/hooks/use-slug-availability";
import { storeUrl } from "@/lib/store-url";

interface SlugInputProps extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  hint: SlugHint;
}

/** The "Store URL name" input: lowercases while typing, shows the full URL and the availability hint. */
export const SlugInput = ({ value, onChange, hint, ...props }: SlugInputProps) => (
  <div className="space-y-1">
    <Input
      {...props}
      value={value}
      autoCapitalize="none"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
    />
    <p className="text-xs text-muted-foreground break-all">{storeUrl(value || "your-store")}</p>
    {hint.state === "checking" && <p className="text-xs text-muted-foreground">Checking...</p>}
    {hint.state === "available" && <p className="text-xs text-green-600 dark:text-green-400">Available</p>}
    {hint.state === "error" && <p className="text-xs text-destructive">{hint.error}</p>}
  </div>
);
