import { cn } from "@/lib/utils";
import { PaymentStatus, PAYMENT_STATUS_LABELS, isCancelled, isQuote } from "@/lib/orders/status";

// Tinted backgrounds with a text colour per theme, so they read in light and dark mode.
export const TONES = {
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  green: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  red: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
} as const;
export type Tone = keyof typeof TONES;

/** The colour follows the position in the store's list: first = grey, last = green, in between = blue. Cancelled = red, Quote = amber. */
export function statusTone(status: string, statuses: readonly string[]): Tone {
  if (isCancelled(status)) return "red";
  if (isQuote(status)) return "amber";
  const i = statuses.indexOf(status);
  if (i < 0 || i === 0) return "slate";
  return i === statuses.length - 1 ? "green" : "blue";
}

const PAY_TONE: Record<PaymentStatus, Tone> = {
  PENDING: "amber",
  PAID: "green",
  PARTIALLY_REFUNDED: "blue",
  REFUNDED: "slate",
  FAILED: "red",
};

const base = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold";

export const StatusBadge = ({ status, statuses, className }: { status: string; statuses: readonly string[]; className?: string }) => (
  <span className={cn(base, TONES[statusTone(status, statuses)], className)}>{status}</span>
);

export const PaymentBadge = ({ status, className }: { status: PaymentStatus; className?: string }) => (
  <span className={cn(base, TONES[PAY_TONE[status]], className)}>{PAYMENT_STATUS_LABELS[status]}</span>
);

/** "COD", "UPI", or "Not decided" when the method is empty. */
export const paymentMethodLabel = (payment: string) => payment || "Not decided";
