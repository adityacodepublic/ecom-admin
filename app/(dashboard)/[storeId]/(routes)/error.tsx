"use client";

import { Button } from "@/components/ui/button";

/** A page of the store admin failed to load (for example a streamed read that was rejected). The navigation stays. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex-1 space-y-3 p-4 pt-6 md:p-8">
      <h2 className="text-lg font-semibold">This page could not load</h2>
      <p className="text-sm text-muted-foreground">Something went wrong while reading your store&apos;s data. Try again; if it keeps happening, reload the page.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Error code: {error.digest}</p>}
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
