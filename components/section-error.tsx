"use client";

import { Component } from "react";

/**
 * Catches a failed part of a streamed page (a promise read with `use()` that rejected), so only that part shows an
 * error and the rest of the page stays. Put it around a <Suspense> boundary.
 */
export class SectionError extends Component<{ title?: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Could not load {this.props.title ?? "this part"}.{" "}
        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
