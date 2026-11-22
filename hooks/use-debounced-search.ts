"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A search box over a server-read list: the box follows what is typed at once, and `commit` gets the trimmed text
 * a moment after typing stops. When the applied value changes from elsewhere (a link, Clear filters) the box follows it.
 */
export function useDebouncedSearch(applied: string, commit: (text: string) => void, delayMs = 400) {
  const [text, setText] = useState(applied);
  // Follow a new applied value during render (React's pattern for state that tracks a prop), not in an effect.
  const [seen, setSeen] = useState(applied);
  if (applied !== seen) {
    setSeen(applied);
    setText(applied);
  }
  // The latest `commit` (a new function on every render of the caller), without restarting the timer for it.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    if (text.trim() === applied) return;
    const t = setTimeout(() => commitRef.current(text.trim()), delayMs);
    return () => clearTimeout(t);
  }, [text, applied, delayMs]);
  return [text, setText] as const;
}
