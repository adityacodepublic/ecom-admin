import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { Minimizable } from "./minimize";

/**
 * The building blocks of the dashboard cards, so every card has the same header, spacing and empty state. No hooks:
 * used by server and client components alike.
 */

export const Empty = ({ text = "Nothing yet." }: { text?: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

/** "1 order", "3 orders". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a list of the newest rows shows: "Newest 25 of 40 orders." or "3 orders." */
export const countLabel = (shown: number, total: number, word = "order") => (total > shown ? `Newest ${shown} of ${total} ${word}s.` : `${plural(total, word)}.`);

/** "12.5%", or "–" when there is nothing to divide by. */
export const pct = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "–");

/** A card row that is a link to the data behind it: the label, then its value. */
export const rowLink = "-mx-1 flex justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const focusRing = "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A titled card: the title, an optional note under it, then the content. */
export const InsightCard = ({
  title,
  note,
  className,
  contentClassName,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) => (
  <Card className={className}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </CardHeader>
    <CardContent className={contentClassName}>{children}</CardContent>
  </Card>
);

type StatProps = {
  title: string;
  value: string;
  note?: string; // under the value: what it counts
  help?: string; // what the number means, for owners new to it
  Icon?: LucideIcon;
} & ({ href?: string; onClick?: never; label?: never } | { href?: never; onClick: () => void; label: string }); // label = what the button opens

/** A number card. With `href` the whole card is a link to the data behind it; with `onClick` it is a button. */
export const StatCard = ({ title, value, note, help, Icon, href, onClick, label }: StatProps) => {
  const card = (
    <Card className={cn("h-full", (href || onClick) && "transition-colors hover:bg-accent")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </CardHeader>
      <CardContent>
        <div className="truncate text-2xl font-bold">{value}</div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
      </CardContent>
    </Card>
  );
  if (href)
    return (
      <Link href={href} className={focusRing}>
        {card}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-label={label} className={cn(focusRing, "text-left")}>
        {card}
      </button>
    );
  return card;
};

/** One dashboard card with the id the "minimized" cookie keeps (fixed: never derive it from the title). */
export type DashboardCard = { id: string; title: string; node: React.ReactNode };
export const dashCard = (id: string, title: string, node: React.ReactNode): DashboardCard => ({ id, title, node });

/**
 * A grid of cards that can each be minimized (right-click or long-press); a minimized card goes to the page's one
 * "Minimized cards" list.
 */
export const MinimizableGrid = ({ cards, className }: { cards: DashboardCard[]; className: string }) => (
  <div className={cn("grid grid-cols-1 gap-4", className)}>
    {cards.map((c) => (
      <Minimizable key={c.id} id={c.id} title={c.title}>
        {c.node}
      </Minimizable>
    ))}
  </div>
);
