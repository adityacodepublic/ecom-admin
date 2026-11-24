"use client";

import axios from "axios";
import { useEffect, useState } from "react";

import { slugError } from "@/lib/slug";

export type SlugHint = { state: "idle" | "checking" | "available" } | { state: "error"; error: string };

/**
 * Live hint while the owner types a store URL name: rules first (no request), then a debounced
 * GET /api/stores/slug-available. A hint only: the save still gets 409 when someone else wins a race.
 * With storeId (rename), the store's own current slug counts as available.
 */
export function useSlugAvailability(slug: string, storeId?: string): SlugHint {
  const value = slug.trim().toLowerCase();
  const invalid = value ? slugError(value) : null;
  const checkKey = value && !invalid ? `${storeId ?? ""}::${value}` : null;
  const [resolved, setResolved] = useState<{ key: string; hint: SlugHint } | null>(null);

  useEffect(() => {
    if (!checkKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get("/api/stores/slug-available", {
          params: { slug: value, storeId },
          signal: controller.signal,
        });
        setResolved({
          key: checkKey,
          hint: data.available ? { state: "available" } : { state: "error", error: data.error },
        });
      } catch {
        if (!controller.signal.aborted) {
          setResolved({ key: checkKey, hint: { state: "idle" } }); // no hint; the save decides
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [checkKey, value, storeId]);

  if (!value) return { state: "idle" };
  if (invalid) return { state: "error", error: invalid };
  if (resolved && resolved.key === checkKey) return resolved.hint;
  return { state: "checking" };
}

/** The server's field error from a 400/409 response, if it is one. */
export const slugErrorFromResponse = (error: unknown): string | null => {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  return data?.field === "slug" && typeof data.error === "string" ? data.error : null;
};
