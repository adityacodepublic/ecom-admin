"use client";

import { useEffect, useRef, useState } from "react";

import type { PageName, PageSection } from "@/lib/home-layout";

/**
 * The real store component for one section, rendered by the store's /preview/section
 * route in an iframe. The frame takes the height the store page reports.
 * The category and product pages show the block for a real category or product (`itemId`).
 */
export const SectionPreview = ({ storeUrl, page, itemId, section }: { storeUrl: string; page: PageName; itemId?: string; section: PageSection }) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  // The admin window height: the store sizes some images in vh, and the small iframe's vh would be wrong.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => setViewportHeight(window.innerHeight), []);
  const src = useDebounced(
    viewportHeight &&
      `${storeUrl}/preview/section?vh=${viewportHeight}&page=${page}${itemId ? `&${page === "product" ? "productId" : "categoryId"}=${encodeURIComponent(itemId)}` : ""}&section=${encodeURIComponent(JSON.stringify(section))}`,
    400,
  );

  useEffect(() => {
    const storeOrigin = new URL(storeUrl).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === storeOrigin && e.source === frame.current?.contentWindow && e.data?.type === "section-preview-height") {
        setHeight(e.data.height);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [storeUrl]);

  return (
    <iframe
      ref={frame}
      src={src || undefined}
      title="Section preview"
      loading="lazy"
      // A preview only: links inside must not navigate the frame.
      className="pointer-events-none w-full rounded-md border bg-white"
      style={{ height }}
    />
  );
};

/** The value, but only after it stopped changing for `ms`. Typing in the form does not reload the frame per key. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
