/**
 * Order status and payment status.
 *
 * Order statuses are an ordered list the store owner writes in Settings (settings.orders.statuses, plain text labels).
 * The first one is where new orders start, the last one is the final stage (returns open there).
 * Two words are reserved, the system provides them (they are not in the list):
 *   "Cancelled" is where a cancelled order ends.
 *   "Quote" is where an order with a price-on-request product waits for the seller's price and the customer's yes
 *   (details.quote holds which part). Accepting it moves the order to the first status of the list.
 * An order stores the status text itself. Text that is not in the list any more (renamed or removed) is an
 * "old" status: the admin replaces it with a current one.
 */

export type OrderStatus = string;

export const CANCELLED = "Cancelled";
export const QUOTE = "Quote";
export const DEFAULT_ORDER_STATUSES = ["Placed", "Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"];

export const STATUS_MIN = 2;
export const STATUS_MAX = 12;
export const STATUS_LABEL_MAX = 30;

const key = (s: string) => s.trim().toLowerCase();
export const isCancelled = (s: string) => key(s) === key(CANCELLED);
export const isQuote = (s: string) => key(s) === key(QUOTE);

/** Trims, drops blanks and duplicates, checks the limits. For the Settings text box. */
export function cleanStatusList(input: readonly string[], reserved: readonly string[] = [CANCELLED, QUOTE]): { ok: true; list: string[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of input) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label || seen.has(key(label))) continue;
    if (label.length > STATUS_LABEL_MAX) return { ok: false, error: `"${label.slice(0, 12)}…" is longer than ${STATUS_LABEL_MAX} characters` };
    if (reserved.some((r) => key(r) === key(label))) return { ok: false, error: `"${label}" is reserved, the system provides it` };
    seen.add(key(label));
    list.push(label);
  }
  if (list.length < STATUS_MIN) return { ok: false, error: `Add at least ${STATUS_MIN} statuses` };
  if (list.length > STATUS_MAX) return { ok: false, error: `Use at most ${STATUS_MAX} statuses` };
  return { ok: true, list };
}

export const nextStatus = (list: readonly string[], cur: string): string | null => {
  const i = list.indexOf(cur);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
};
export const prevStatus = (list: readonly string[], cur: string): string | null => {
  const i = list.indexOf(cur);
  return i > 0 ? list[i - 1] : null;
};
export const isFinalStatus = (list: readonly string[], cur: string) => list.length > 0 && cur === list[list.length - 1];

/**
 * Why the admin cannot move the order status: it is complete (final stage), a return exists, or it is a quote (it moves
 * on when the customer accepts the price; it can still be cancelled). Null = movable.
 */
export type StatusLock = "FINAL" | "RETURN" | "QUOTE";
export function statusLock(list: readonly string[], status: string, hasReturn: boolean): StatusLock | null {
  if (isQuote(status)) return "QUOTE";
  if (isFinalStatus(list, status)) return "FINAL";
  if (hasReturn) return "RETURN";
  return null;
}
export const STATUS_LOCK_MESSAGES: Record<StatusLock, string> = {
  FINAL: "This order is complete and can't be moved.",
  RETURN: "A return is in progress.",
  QUOTE: "A quote moves on by itself when the customer accepts the price.",
};

/**
 * Admin moves: one step forward, one step back (to fix a mistake), or Cancelled.
 * An old status (not in the list) may move to any status of the list. Cancelled is final (stock goes back once).
 * The FINAL stage is frozen: no step back, no cancel (that is a return). While a return exists the status is frozen too
 * (see statusLock, which adminUpdateOrder checks first because it also knows about the return).
 */
export function canMoveStatus(list: readonly string[], from: string, to: string): boolean {
  if (from === to || isCancelled(from) || isFinalStatus(list, from)) return false;
  if (isCancelled(to)) return true;
  if (isQuote(from) || isQuote(to)) return false; // a quote leaves only by the customer's yes (or a cancel)
  if (!list.includes(to)) return false;
  if (!list.includes(from)) return true;
  return to === nextStatus(list, from) || to === prevStatus(list, from);
}

/** The status options of a filter: Quote (when some order is one), the list, then Cancelled, then old statuses that orders still use. */
export function statusOptions(list: readonly string[], used: readonly string[] = []): string[] {
  const out = [...(used.includes(QUOTE) ? [QUOTE] : []), ...list, CANCELLED];
  for (const s of used) if (!out.includes(s)) out.push(s);
  return out;
}

// ---------------------------------------------------------------- returns

/**
 * Return statuses are a second ordered list (settings.orders.returns.statuses). The first is "requested" (the customer
 * may withdraw while it is there), the last is the finished state. "Rejected" is reserved: it ends a return.
 */
export const REJECTED = "Rejected";
export const DEFAULT_RETURN_STATUSES = ["Requested", "Approved", "Picked up", "Received", "Refunded"];
export const DEFAULT_RETURN_REASONS = ["Damaged", "Wrong item", "Not as described", "Changed my mind"];
export const RETURN_WINDOW_DEFAULT = 10;

export const isRejected = (s: string) => key(s) === key(REJECTED);

/** Same moves as orders: one step forward, one back, Rejected (before the last step). An old status may go anywhere in the list. */
export function canMoveReturn(list: readonly string[], from: string, to: string): boolean {
  if (from === to || isRejected(from)) return false;
  if (isRejected(to)) return !isFinalStatus(list, from);
  if (!list.includes(to)) return false;
  if (!list.includes(from)) return true;
  return to === nextStatus(list, from) || to === prevStatus(list, from);
}

/** The customer may withdraw the request only while it is at the first return status. */
export const canWithdrawReturn = (list: readonly string[], status: string) => list.length > 0 && status === list[0];

/** One withdrawal per order at most (details.returnWithdrawals), and never after the items were put back into stock. */
export const MAX_RETURN_WITHDRAWALS = 1;
export const mayWithdrawReturn = (list: readonly string[], ret: { status: string; restocked: boolean }, withdrawals: number) =>
  canWithdrawReturn(list, ret.status) && !ret.restocked && withdrawals < MAX_RETURN_WITHDRAWALS;

// ---------------------------------------------------------------- payment

export const PAYMENT_STATUSES = ["PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  FAILED: "Failed",
};

/** Payment status moves the admin may make: any status to any other, so a mistake can always be fixed. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = Object.fromEntries(
  PAYMENT_STATUSES.map((s) => [s, PAYMENT_STATUSES.filter((t) => t !== s)]),
) as unknown as Record<PaymentStatus, readonly PaymentStatus[]>;

export const isPaymentStatus = (s: unknown): s is PaymentStatus =>
  typeof s === "string" && (PAYMENT_STATUSES as readonly string[]).includes(s);

export function normalizePaymentStatus(raw: string): PaymentStatus {
  return isPaymentStatus(raw) ? raw : "PENDING";
}

export const canMovePayment = (from: PaymentStatus, to: PaymentStatus) => PAYMENT_TRANSITIONS[from].includes(to);

/** The payment method for COD. Never renamed. */
export const COD = "COD";
