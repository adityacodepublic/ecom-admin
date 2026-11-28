import { cn } from "@/lib/utils";

/**
 * A plain grey pulsing block that stands in for one element while it loads (a card, a table, a heading, a button).
 * Size and place it like the element it stands for; draw nothing inside it. The page skeletons are in
 * components/loading/.
 */
export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div aria-hidden className={cn("animate-pulse rounded-md bg-zinc-200/65 dark:bg-muted", className)} style={style} />
);
