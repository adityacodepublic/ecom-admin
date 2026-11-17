import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { STATUS_LABEL_MAX } from "./status";

/**
 * Order.details: one JSON object per order with everything that is only shown on a page.
 * Versioned ({ v: 1, ... }) and always checked with this schema, on write AND on read.
 * Writes go through lib/orders/update.ts (row lock + append) only.
 */

export const EVENT_TYPES = ["status", "comment", "payment", "delivery", "return", "email", "system"] as const;
export const EVENT_ACTORS = ["customer", "admin", "system"] as const;

const isoDateTime = z.string().datetime({ offset: true });

export const orderEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  status: z.string().max(STATUS_LABEL_MAX).optional(), // for type "status": the new status (its text)
  message: z.string().max(5000).optional(),
  customerVisible: z.boolean(),
  actor: z.enum(EVENT_ACTORS),
  at: isoDateTime,
  // Admin-only extra data (old/new values, ids). Never sent to the customer.
  meta: z.record(z.unknown()).optional(),
});
export type OrderEvent = z.infer<typeof orderEventSchema>;

// No length limits here on purpose: inputs are limited where they are typed (checkout / address schemas),
// and old backfilled orders must always read, whatever their profile held.
export const shipToSchema = z.object({
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  pincode: z.string(),
  instructions: z.string(),
});
export type ShipTo = z.infer<typeof shipToSchema>;

/** A day, no time: YYYY-MM-DD (India date). */
export const expectedDeliverySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date as YYYY-MM-DD");

const paise = z.number().int().min(0);

export const moneySchema = z.object({
  subtotalPaise: paise,
  shippingPaise: paise,
  totalPaise: paise,
});
export type OrderMoney = z.infer<typeof moneySchema>;

export const orderItemSnapshotSchema = z.object({
  productId: z.string(),
  name: z.string(),
  pricePaise: paise, // unit price when the order was placed
  quantity: z.number().int(),
});
export type OrderItemSnapshot = z.infer<typeof orderItemSnapshotSchema>;

export const MARKDOWN_MAX = 20000;
export const PRIVATE_NOTE_MAX = 2000;

/** A return of the whole order (one at a time). status = text from the store's return list, or "Rejected". */
export const orderReturnSchema = z.object({
  status: z.string().max(STATUS_LABEL_MAX),
  reason: z.string().max(500),
  note: z.string().max(500).nullable(), // the customer's own words (optional)
  requestedAt: isoDateTime,
  restocked: z.boolean(), // the items were put back into stock (once)
});

export const orderDetailsSchema = z.object({
  v: z.literal(1),
  events: z.array(orderEventSchema),
  shipTo: shipToSchema,
  expectedDelivery: expectedDeliverySchema.nullable().default(null), // set by the admin, shown to the customer
  privateNote: z.string().max(PRIVATE_NOTE_MAX).nullable().default(null), // Markdown, ADMIN ONLY: never in any customer response
  customerNote: z.string().max(MARKDOWN_MAX).nullable(), // Markdown, written by the customer at checkout
  adminContent: z.string().max(MARKDOWN_MAX).nullable(), // Markdown, written by the admin, shown to the customer
  money: moneySchema,
  items: z.array(orderItemSnapshotSchema),
  // True when this order took stock at checkout (all new orders). Old backfilled orders never did, so
  // cancelling them must not add stock. Set to false when the stock is given back. Server-only.
  stockReserved: z.boolean().optional(),
  return: orderReturnSchema.nullable().default(null),
});
export type OrderDetails = z.infer<typeof orderDetailsSchema>;

/** For writing to the Json column (the object was checked by orderDetailsSchema). */
export const detailsToJson = (d: OrderDetails) => d as unknown as Prisma.InputJsonValue;

export class InvalidOrderDetailsError extends Error {
  constructor(orderId: string, issues: string) {
    super(`Order ${orderId} has invalid details: ${issues}`);
  }
}

/** Reads Order.details. Throws InvalidOrderDetailsError when the stored JSON does not match the schema. */
export function parseDetails(orderId: string, raw: unknown): OrderDetails {
  const r = orderDetailsSchema.safeParse(raw);
  if (!r.success) throw new InvalidOrderDetailsError(orderId, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** Same, but for lists: a broken row gives null instead of breaking the whole page. */
export function parseDetailsOrNull(orderId: string, raw: unknown): OrderDetails | null {
  try {
    return parseDetails(orderId, raw);
  } catch (error) {
    console.error("[ORDER_DETAILS]", error instanceof Error ? error.message : error);
    return null;
  }
}

/** What the customer may see of one event: an allow-list, built as a new object (no meta, no private events). */
export type CustomerOrderEvent = Pick<OrderEvent, "id" | "type" | "status" | "message" | "actor" | "at">;

export function customerEvents(events: OrderEvent[]): CustomerOrderEvent[] {
  return events
    .filter((e) => e.customerVisible === true)
    .map((e) => {
      const out: CustomerOrderEvent = { id: e.id, type: e.type, actor: e.actor, at: e.at };
      if (e.status !== undefined) out.status = e.status;
      if (e.message !== undefined) out.message = e.message;
      return out;
    });
}
