import { Prisma } from "@prisma/client";
import { z } from "zod";

import { parseContact, type StoreContact } from "@/lib/contact";
import { readSettings, readSettingsTx, settingsPart, updateSettingsPart } from "@/lib/store-settings";
import { DEFAULT_ORDER_STATUSES, DEFAULT_RETURN_REASONS, DEFAULT_RETURN_STATUSES, REJECTED, RETURN_WINDOW_DEFAULT, cleanStatusList } from "./status";

/**
 * Store.settings.orders (JSON, missing = all defaults).
 *   autoEmails           send order emails automatically (off; real sending comes later, a domain is needed)
 *   checkoutPaymentStep  true: checkout shows "Cash on delivery" and places a COD order.
 *                        false: no payment step; the order is placed with payment "" and the seller
 *                        agrees the method with the buyer, then types it in the status update form.
 *   statuses             the ordered list of order statuses (first = start, last = final stage)
 *   waitingUntil         the dashboard's "Orders waiting too long" card: orders that have not reached this status
 *                        48 hours after they were placed (the starting status = orders still at it). Picked on the card.
 *   cancellation         customer cancellation: on/off, the statuses where it is allowed, the reasons
 *   returns              customer returns: on/off, the window in days, the reasons, the return statuses
 */
const statusList = z.array(z.string()).transform((a, ctx) => {
  const r = cleanStatusList(a);
  if (!r.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
    return z.NEVER;
  }
  return r.list;
});

const reasonList = z
  .array(z.string())
  .transform((a) => Array.from(new Set(a.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))).slice(0, 12))
  .refine((a) => a.every((s) => s.length <= 60), "A reason is at most 60 characters");

export const DEFAULT_CANCEL_REASONS = ["Ordered by mistake", "Found a better price", "Delivery is too slow"];

export const cancellationSchema = z.object({
  enabled: z.boolean().default(true),
  allowedAt: z.array(z.string()).default(DEFAULT_ORDER_STATUSES.slice(0, 3)),
  askReason: z.boolean().default(true),
  reasons: reasonList.default(DEFAULT_CANCEL_REASONS),
});

const returnStatusList = z.array(z.string()).transform((a, ctx) => {
  const r = cleanStatusList(a, [REJECTED]);
  if (!r.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
    return z.NEVER;
  }
  return r.list;
});

export const returnsSchema = z.object({
  enabled: z.boolean().default(false),
  windowDays: z.number().int().min(1).max(90).default(RETURN_WINDOW_DEFAULT),
  reasons: reasonList.default(DEFAULT_RETURN_REASONS),
  statuses: returnStatusList.default(DEFAULT_RETURN_STATUSES),
});

export const orderSettingsSchema = z.object({
  autoEmails: z.boolean().default(false),
  checkoutPaymentStep: z.boolean().default(true),
  statuses: statusList.default(DEFAULT_ORDER_STATUSES),
  waitingUntil: z.string().default(""), // "" or not in the list = the default (see tidy)
  cancellation: cancellationSchema.default({}),
  returns: returnsSchema.default({}),
});
export type OrderSettings = z.infer<typeof orderSettingsSchema>;

/** PATCH body: any subset. */
export const orderSettingsPatchSchema = z
  .object({
    autoEmails: z.boolean().optional(),
    checkoutPaymentStep: z.boolean().optional(),
    statuses: statusList.optional(),
    waitingUntil: z.string().trim().max(60).optional(),
    cancellation: cancellationSchema.partial().optional(),
    returns: returnsSchema.partial().optional(),
  })
  .strict();
export type OrderSettingsPatch = z.infer<typeof orderSettingsPatchSchema>;

/** The waiting card's status when none is picked, or the picked one is gone (renamed or removed): "Shipped", else the starting status. */
const defaultWaitingUntil = (statuses: string[]) => statuses.find((s) => s.toLowerCase() === "shipped") ?? statuses[0];

/** Statuses where cancelling is ticked must exist in the list; so must the waiting card's status. */
function tidy(s: OrderSettings): OrderSettings {
  const waitingUntil = s.statuses.includes(s.waitingUntil) ? s.waitingUntil : defaultWaitingUntil(s.statuses);
  return { ...s, waitingUntil, cancellation: { ...s.cancellation, allowedAt: s.cancellation.allowedAt.filter((x) => s.statuses.includes(x)) } };
}

/** The statuses an order is "waiting" at: those before the card's status, or just the starting status when that is the one picked. */
export const waitingStatuses = (s: OrderSettings) => s.statuses.slice(0, Math.max(1, s.statuses.indexOf(s.waitingUntil)));

/** The stored settings JSON (Store.settings) -> full order settings with defaults. Bad stored data falls back to the defaults. */
export function parseOrderSettings(settings: unknown): OrderSettings {
  const r = orderSettingsSchema.safeParse(settingsPart(settings, "orders") ?? {});
  if (r.success) return tidy(r.data);
  console.error("[ORDER_SETTINGS] invalid stored settings, using defaults", r.error.issues);
  return tidy(orderSettingsSchema.parse({}));
}

/** What anybody (the store, the browser) may see. The contact comes from the store's own contact details. */
export type PublicOrderSettings = {
  checkoutPaymentStep: boolean;
  contact: { phone: string; whatsapp: string };
  statuses: string[];
  cancellation: { enabled: boolean; askReason: boolean; reasons: string[] };
  returns: { enabled: boolean; windowDays: number; reasons: string[]; statuses: string[] };
};

export const publicOrderSettings = (s: OrderSettings, c: StoreContact): PublicOrderSettings => ({
  checkoutPaymentStep: s.checkoutPaymentStep,
  contact: { phone: c.phone, whatsapp: c.whatsapp },
  statuses: s.statuses,
  cancellation: { enabled: s.cancellation.enabled, askReason: s.cancellation.askReason, reasons: s.cancellation.reasons },
  returns: { enabled: s.returns.enabled, windowDays: s.returns.windowDays, reasons: s.returns.reasons, statuses: s.returns.statuses },
});

/** Full settings of a store, or null when the store does not exist. For admin server pages. */
export async function getOrderSettings(storeId: string): Promise<OrderSettings | null> {
  const settings = await readSettings(storeId);
  return settings === null ? null : parseOrderSettings(settings);
}

/** The same, inside a transaction (the order update functions). Defaults when the store is missing. */
export async function getOrderSettingsTx(tx: Prisma.TransactionClient, storeId: string): Promise<OrderSettings> {
  return parseOrderSettings(await readSettingsTx(tx, storeId));
}

/** Merges a patch into the store's settings (owner check is the caller's job). */
export async function updateOrderSettings(storeId: string, patch: OrderSettingsPatch): Promise<OrderSettings | null> {
  return updateSettingsPart(storeId, "orders", (stored) => {
    const current = parseOrderSettings({ orders: stored });
    return tidy(
      orderSettingsSchema.parse({
        ...current,
        ...patch,
        cancellation: { ...current.cancellation, ...patch.cancellation },
        returns: { ...current.returns, ...patch.returns },
      }),
    );
  });
}

/** The public settings of a store (settings + contact), or null when the store does not exist. */
export async function getPublicOrderSettings(storeId: string): Promise<PublicOrderSettings | null> {
  const settings = await readSettings(storeId);
  return settings === null ? null : publicOrderSettings(parseOrderSettings(settings), parseContact(settings));
}
