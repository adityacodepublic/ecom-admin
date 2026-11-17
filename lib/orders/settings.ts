import { Prisma } from "@prisma/client";
import { z } from "zod";

import { parseContact, type StoreContact } from "@/lib/contact";
import prismadb from "@/lib/prismadb";
import {
  DEFAULT_ORDER_STATUSES,
  DEFAULT_RETURN_REASONS,
  DEFAULT_RETURN_STATUSES,
  REJECTED,
  RETURN_WINDOW_DEFAULT,
  cleanStatusList,
} from "./status";

/**
 * Store.orderSettings (JSON, null = all defaults).
 *   autoEmails           send order emails automatically (off; real sending comes later, a domain is needed)
 *   checkoutPaymentStep  true: checkout shows "Cash on delivery" and places a COD order.
 *                        false: no payment step; the order is placed with payment "" and the seller
 *                        agrees the method with the buyer, then types it in the status update form.
 *   statuses             the ordered list of order statuses (first = start, last = final stage)
 *   cancellation         customer cancellation: on/off, the statuses where it is allowed, the reasons
 *   returns              customer returns: on/off, the window in days, the reasons, the return statuses
 */
const statusList = z
  .array(z.string())
  .transform((a, ctx) => {
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
    cancellation: cancellationSchema.partial().optional(),
    returns: returnsSchema.partial().optional(),
  })
  .strict();
export type OrderSettingsPatch = z.infer<typeof orderSettingsPatchSchema>;

/** Statuses where cancelling is ticked must exist in the list. */
function tidy(s: OrderSettings): OrderSettings {
  return { ...s, cancellation: { ...s.cancellation, allowedAt: s.cancellation.allowedAt.filter((x) => s.statuses.includes(x)) } };
}

/** The stored JSON -> full settings with defaults. Bad stored data falls back to the defaults. */
export function parseOrderSettings(raw: unknown): OrderSettings {
  const r = orderSettingsSchema.safeParse(raw ?? {});
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
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { orderSettings: true } });
  return store ? parseOrderSettings(store.orderSettings) : null;
}

/** The same, inside a transaction (the order update functions). Defaults when the store is missing. */
export async function getOrderSettingsTx(tx: Prisma.TransactionClient, storeId: string): Promise<OrderSettings> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { orderSettings: true } });
  return parseOrderSettings(store?.orderSettings);
}

/** Merges a patch into the store's settings (owner check is the caller's job). */
export async function updateOrderSettings(storeId: string, patch: OrderSettingsPatch): Promise<OrderSettings | null> {
  return prismadb.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ orderSettings: unknown }[]>`
      SELECT "orderSettings" FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    if (rows.length === 0) return null;
    const current = parseOrderSettings(rows[0].orderSettings);
    const next = tidy(
      orderSettingsSchema.parse({
        ...current,
        ...patch,
        cancellation: { ...current.cancellation, ...patch.cancellation },
        returns: { ...current.returns, ...patch.returns },
      }),
    );
    await tx.store.update({ where: { id: storeId }, data: { orderSettings: next } });
    return next;
  });
}

/** The public settings of a store (settings + contact), or null when the store does not exist. */
export async function getPublicOrderSettings(storeId: string): Promise<PublicOrderSettings | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { orderSettings: true, contact: true } });
  return store ? publicOrderSettings(parseOrderSettings(store.orderSettings), parseContact(store.contact)) : null;
}
