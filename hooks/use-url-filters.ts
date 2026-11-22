"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Filters kept in the URL of a server-read list (Orders, Customers): the URL is the one source of truth, the page reads
 * it on the server. `set` changes some keys ("" removes one) and goes back to page 1 unless the page itself is set.
 * The navigation runs in a transition, so the list on screen stays (see `pending`) until the new one is ready.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const hrefWith = (changes: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (!("page" in changes)) sp.delete("page");
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const set = (changes: Record<string, string>) => startTransition(() => router.push(hrefWith(changes), { scroll: false }));
  /** Empties every given key. */
  const clear = (keys: readonly string[]) => set(Object.fromEntries(keys.map((k) => [k, ""])));

  return { set, clear, pending };
}
