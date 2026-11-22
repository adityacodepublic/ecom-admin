"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "react-hot-toast";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { Empty, InsightCard, rowLink } from "./cards";

type Waiting = {
  hours: number;
  status: string; // the picked status: orders not yet at it count (the starting status = orders still at it)
  statuses: string[];
  count: number;
  orders: { id: string; orderNumber: number; status: string; ageHours: number }[];
};

const age = (hours: number) => (hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`);

/**
 * "Orders waiting too long": orders placed a while ago that have not reached the status picked here (by default
 * "Shipped", or the starting status when there is no "Shipped"). The pick is saved with the store's order settings,
 * so it stays on every device; a renamed or removed status falls back to the default.
 */
export const WaitingCard = ({ storeId, waiting: w }: { storeId: string; waiting: Waiting }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const first = w.statuses[0];

  const pick = (status: string) =>
    startTransition(async () => {
      const res = await fetch(`/api/${storeId}/order-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ waitingUntil: status }),
      });
      if (!res.ok) {
        toast.error("Could not save. Try again.");
        return;
      }
      router.refresh();
    });

  return (
    <InsightCard
      title="Orders waiting too long"
      note={`Placed ${w.hours} hours ago or more (${w.count})`}
      contentClassName={cn("space-y-1 text-sm transition-opacity", pending && "opacity-60")}
    >
      <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
        <span className="shrink-0">{w.status === first ? "Still at" : "Not yet at"}</span>
        <Select value={w.status} onValueChange={pick} disabled={pending}>
          <SelectTrigger className="h-7 w-auto min-w-32 text-xs" aria-label="Count orders that have not reached this status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {w.statuses.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {w.orders.length === 0 && <Empty />}
      {w.orders.map((o) => (
        <Link key={o.id} href={`/${storeId}/orders/${o.orderNumber}`} className={rowLink}>
          <span className="truncate">
            #{o.orderNumber} <span className="text-muted-foreground">({o.status})</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{age(o.ageHours)}</span>
        </Link>
      ))}
    </InsightCard>
  );
};
