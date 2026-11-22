"use client";

import { Suspense, use } from "react";

import { SectionError } from "@/components/section-error";
import { cachedJson } from "@/lib/cached-json";

/**
 * Reads JSON from our API when it is first shown (a dialog's table, a filter's options) and renders it. React's use()
 * reads the request inside <Suspense>, so "Loading..." shows meanwhile; a failed request shows an error in its place.
 * The answer is kept in the browser for `ttlMs` (lib/cached-json.ts).
 */
export function Fetched<T>({ url, ttlMs, children }: { url: string; ttlMs: number; children: (data: T) => React.ReactNode }) {
  return (
    <SectionError title="this list">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Read<T> url={url} ttlMs={ttlMs}>
          {children}
        </Read>
      </Suspense>
    </SectionError>
  );
}

function Read<T>({ url, ttlMs, children }: { url: string; ttlMs: number; children: (data: T) => React.ReactNode }) {
  return <>{children(use(cachedJson<T>(url, ttlMs)))}</>;
}
