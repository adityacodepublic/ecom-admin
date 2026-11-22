"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Minus, Square } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { minimizedCookie, serializeMinimized, type MinimizedCard } from "@/lib/minimized-cards";
import { cn } from "@/lib/utils";

/**
 * Dashboard cards the owner has minimized (right-click or long-press a card > Minimize card). They are kept in a
 * cookie per store, with their titles, so the server renders the page without them (no flash) and it is the same
 * after a reload. The page has one "Minimized cards" list (MinimizedList); a click there brings a card back. Right
 * after a card is minimized, the page scrolls to that list and it glows for a moment, so the owner sees where it went;
 * a card shown again is scrolled to and glows the same way, in its own place.
 */

const YEAR = 60 * 60 * 24 * 365;
const GLOW_MS = 2400;
// "!" (important): a card's own shadow class would otherwise win over the glow.
const GLOW = ["ring-2", "ring-blue-500/50", "shadow-[0_0_32px_-2px_rgba(59,130,246,0.5)]!"];

/** Brings an element into view (no smooth scroll for people who asked for less motion). */
const scrollToCenter = (el: Element | null | undefined) =>
  el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });

type Ctx = {
  minimized: MinimizedCard[];
  isHidden: (id: string) => boolean;
  minimize: (card: MinimizedCard) => void;
  restore: (id: string) => void;
  justMinimized: string | null; // the card minimized a moment ago: the list scrolls into view and glows
  justRestored: string | null; // the card shown again a moment ago: it scrolls into view and glows
  settle: () => void;
};
const MinimizeContext = createContext<Ctx | null>(null);

export const MinimizeProvider = ({ storeId, initial, children }: { storeId: string; initial: MinimizedCard[]; children: React.ReactNode }) => {
  const [minimized, setMinimized] = useState(initial);
  const [justMinimized, setJustMinimized] = useState<string | null>(null);
  const [justRestored, setJustRestored] = useState<string | null>(null);
  const save = (next: MinimizedCard[]) => {
    setMinimized(next);
    document.cookie = `${minimizedCookie(storeId)}=${serializeMinimized(next)}; path=/; max-age=${YEAR}; samesite=lax`;
  };
  const value: Ctx = {
    minimized,
    isHidden: (id) => minimized.some((c) => c.id === id),
    minimize: (card) => {
      save([...minimized.filter((c) => c.id !== card.id), card]);
      setJustMinimized(card.id);
      setJustRestored(null);
    },
    restore: (id) => {
      save(minimized.filter((c) => c.id !== id));
      setJustRestored(id);
      setJustMinimized(null);
    },
    justMinimized,
    justRestored,
    settle: () => {
      setJustMinimized(null);
      setJustRestored(null);
    },
  };
  return <MinimizeContext.Provider value={value}>{children}</MinimizeContext.Provider>;
};

const useMinimize = () => {
  const c = useContext(MinimizeContext);
  if (!c) throw new Error("Minimizable and MinimizedList need a MinimizeProvider");
  return c;
};

/** One dashboard card that can be minimized. It adds no box of its own (display: contents), so the grid is unchanged. */
export const Minimizable = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => {
  const { isHidden, minimize, justRestored, settle } = useMinimize();
  const ref = useRef<HTMLDivElement>(null);
  const hidden = isHidden(id);
  const back = !hidden && justRestored === id; // shown again a moment ago
  useEffect(() => {
    // The wrapper has no box of its own (display: contents): scroll to and light up the card inside it.
    const card = ref.current?.firstElementChild;
    if (!back || !card) return;
    scrollToCenter(card);
    card.classList.add("transition-shadow", "duration-700", ...GLOW);
    const t = setTimeout(() => {
      card.classList.remove(...GLOW);
      settle();
    }, GLOW_MS);
    return () => {
      clearTimeout(t);
      card.classList.remove(...GLOW);
    };
    // settle is a new function on every render of the provider; only a newly restored card starts the glow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back]);
  if (hidden) return null;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* Gestures inside the card's own dialogs stop in the dialog (components/ui/dialog). */}
        <div ref={ref} className="contents">
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="truncate">{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => minimize({ id, title })}>
          <Minus /> Minimize card
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** The page's minimized cards, in one card shaped like the others. Nothing shows while none is minimized. */
export const MinimizedList = () => {
  const { minimized, restore, justMinimized, settle } = useMinimize();
  const fresh = minimized.some((c) => c.id === justMinimized) ? justMinimized : null; // minimized a moment ago
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fresh) return;
    scrollToCenter(ref.current);
    const t = setTimeout(settle, GLOW_MS);
    return () => clearTimeout(t);
    // settle is a new function on every render of the provider; only a newly minimized card starts the glow again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);
  if (minimized.length === 0) return null;
  return (
    <Card ref={ref} className={cn("border-dashed transition-shadow duration-700", fresh && ["border-blue-500/50", ...GLOW])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Minimized cards ({minimized.length})</CardTitle>
        <p className="text-xs text-muted-foreground">Hidden from the dashboard. Click one to show it again in its place.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {minimized.map((c) => (
          // The same menu as on a card, with the other window control: the box brings the card back.
          <ContextMenu key={c.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => restore(c.id)}
                aria-label={`Show ${c.title} again`}
                className={cn(
                  "-mx-1 flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  c.id === fresh && "bg-blue-500/10",
                )}
              >
                <span className="truncate">{c.title}</span>
                <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuLabel className="truncate">{c.title}</ContextMenuLabel>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => restore(c.id)}>
                <Square /> Show card
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </CardContent>
    </Card>
  );
};
