"use client";

import { createContext, useContext, useState } from "react";
import { Minus, Square } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { minimizedCookie } from "@/lib/minimized-cards";

/**
 * Dashboard cards the owner has minimized (right-click or long-press a card > Minimize card). The list is kept in a
 * cookie per store, so the server renders the page without them (no flash) and it is the same after a reload. Each
 * section lists its minimized cards in one "Minimized cards" card; a click there brings a card back.
 */

const YEAR = 60 * 60 * 24 * 365;

type Ctx = { hidden: Set<string>; minimize: (id: string) => void; restore: (id: string) => void };
const MinimizeContext = createContext<Ctx | null>(null);

export const MinimizeProvider = ({ storeId, initial, children }: { storeId: string; initial: string[]; children: React.ReactNode }) => {
  const [hidden, setHidden] = useState(() => new Set(initial));
  const save = (next: Set<string>) => {
    setHidden(next);
    document.cookie = `${minimizedCookie(storeId)}=${encodeURIComponent(Array.from(next).join(","))}; path=/; max-age=${YEAR}; samesite=lax`;
  };
  const minimize = (id: string) => save(new Set(hidden).add(id));
  const restore = (id: string) => save(new Set(Array.from(hidden).filter((x) => x !== id)));
  return <MinimizeContext.Provider value={{ hidden, minimize, restore }}>{children}</MinimizeContext.Provider>;
};

const useMinimize = () => {
  const c = useContext(MinimizeContext);
  if (!c) throw new Error("Minimizable and MinimizedList need a MinimizeProvider");
  return c;
};

/** One dashboard card that can be minimized. It adds no box of its own (display: contents), so the grid is unchanged. */
export const Minimizable = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => {
  const { hidden, minimize } = useMinimize();
  if (hidden.has(id)) return null;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* Gestures inside the card's own dialogs stop in the dialog (components/ui/dialog). */}
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="truncate">{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => minimize(id)}>
          <Minus /> Minimize card
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** The minimized cards of one section, in one card shaped like the others. Nothing shows while none is minimized. */
export const MinimizedList = ({ cards }: { cards: { id: string; title: string }[] }) => {
  const { hidden, restore } = useMinimize();
  const shown = cards.filter((c) => hidden.has(c.id));
  if (shown.length === 0) return null;
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Minimized cards ({shown.length})</CardTitle>
        <p className="text-xs text-muted-foreground">Hidden from this section. Click one to show it again.</p>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {shown.map((c) => (
          // The same menu as on a card, with the other window control: the box brings the card back.
          <ContextMenu key={c.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => restore(c.id)}
                aria-label={`Show ${c.title} again`}
                className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
