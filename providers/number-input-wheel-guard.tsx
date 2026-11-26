"use client";

import { useEffect } from "react";

/**
 * Prevents the mouse wheel from silently changing the value of a focused <input type="number"> while scrolling a form.
 * Passive listener: never blocks smooth page scrolling, and covers every number input across the entire Admin app.
 */
export function NumberInputWheelGuard() {
  useEffect(() => {
    const onWheel = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number") {
        el.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
