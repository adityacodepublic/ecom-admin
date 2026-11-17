/**
 * Order status and payment status.
 *
 * Order statuses are an ordered list the store owner writes in Settings (orderSettings.statuses, plain text labels).
 * The first one is where new orders start, the last one is the final stage (returns open there).
 * "Cancelled" is the only reserved word: it is not in the list, it is where a cancelled order ends.
 * An order stores the status text itself. Text that is not in the list any more (renamed or removed) is an
 * "old" status: the admin replaces it with a current one.
 */

export type OrderStatus = string;

export const CANCELLED = "Cancelled";
export const DEFAULT_ORDER_STATUSES = ["Placed", "Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"];

export const STATUS_MIN = 2;
export const STATUS_MAX = 12;
export const STATUS_LABEL_MAX = 30;

const key = (s: string) => s.trim().toLowerCase();
export const isCancelled = (s: string) => key(s) === key(CANCELLED);

/** Trims, drops blanks and duplicates, checks the limits. For the Settings text box. */
export function cleanStatusList(input: readonly string[], reserved: readonly string[] = [CANCELLED]): { ok: true; list: string[] } | { ok: false; error: string } {
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
 * Admin moves: one step forward, one step back (to fix a mistake), or Cancelled.
 * An old status (not in the list) may move to any status of the list. Cancelled is final (stock goes back once).
 * Cancelling is not possible from the final stage (that is a return).
 */
export function canMoveStatus(list: readonly string[], from: string, to: string): boolean {
  if (from === to || isCancelled(from)) return false;
  if (isCancelled(to)) return !isFinalStatus(list, from);
  if (!list.includes(to)) return false;
  if (!list.includes(from)) return true;
  return to === nextStatus(list, from) || to === prevStatus(list, from);
}

/** The status options of a filter: the list, then Cancelled, then old statuses that orders still use. */
export function statusOptions(list: readonly string[], used: readonly string[] = []): string[] {
  const out = [...list, CANCELLED];
  for (const s of used) if (!out.includes(s)) out.push(s);
  return out;
}

// ---------------------------------------------------------------- returns

/**
 * Return statuses are a second ordered list (orderSettings.returns.statuses). The first is "requested" (the customer
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
