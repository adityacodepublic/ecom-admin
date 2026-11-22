import { z } from "zod";

import { PAYMENT_STATUSES, STATUS_LABEL_MAX } from "./status";

/**
 * The admin Orders list query: what the page and the API read from the URL. No database import, so client components
 * can share the keys and types (lib/orders/queries.ts runs the query).
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date as YYYY-MM-DD");
const text = (max: number) => z.string().trim().min(1).max(max).optional();

/**
 * The Delivery column filter. "overdue", "today", "upcoming" and "nodate" are open orders (not cancelled, not at the
 * final step) by their expected delivery day; "delivered" = at the final step.
 */
export const DELIVERY_FILTERS = ["overdue", "today", "upcoming", "nodate", "delivered"] as const;

export const orderListQuerySchema = z.object({
  status: z.string().trim().max(STATUS_LABEL_MAX).optional(), // the status text
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(), // search: order number, customer name / email / phone, receiver name / phone
  from: day.optional(), // first day included, India time
  to: day.optional(), // last day included, India time
  returned: z.literal("1").optional(), // only orders that have a return (any return status)
  state: text(100), // where it was shipped (lib/orders/sql UNKNOWN_PLACE = none saved)
  city: text(100),
  pincode: text(20),
  buyer: text(100), // one customer (their user id)
  hour: z.coerce.number().int().min(0).max(23).optional(), // placed in this hour of the day, India time (0-23)
  weekday: z.coerce.number().int().min(0).max(6).optional(), // placed on this weekday, India time (0 = Sunday)
  delivery: z.enum(DELIVERY_FILTERS).optional(), // where the expected delivery day stands (see DELIVERY_FILTERS)
  minTotal: z.coerce.number().min(0).max(100000000).optional(), // order total in rupees, inclusive
  maxTotal: z.coerce.number().min(0).max(100000000).optional(),
  product: text(100), // orders that have this product (its id)
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** The filters (every URL key but the paging). "Clear filters" empties all of them. */
export const ORDER_FILTER_KEYS = Object.keys(orderListQuerySchema.shape).filter((k) => k !== "page" && k !== "pageSize") as Exclude<keyof OrderListQuery, "page" | "pageSize">[];
export type OrderFilterKey = (typeof ORDER_FILTER_KEYS)[number];

/** Every key the admin Orders list reads from the URL (the page and the API use this one list). */
export const ADMIN_LIST_KEYS = [...ORDER_FILTER_KEYS, "page"] as const;

/** The filters as the page shows them: every key, as text ("" = off). */
export type OrderFilters = Record<OrderFilterKey, string>;
export const filtersAsText = (q: OrderListQuery): OrderFilters => Object.fromEntries(ORDER_FILTER_KEYS.map((k) => [k, q[k] === undefined ? "" : String(q[k])])) as OrderFilters;
