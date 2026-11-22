import { z } from "zod";

import { parseUrlQuery } from "@/lib/url-query";

/** The Customers list query (search, filters, page) as read from the URL. No database import: client components share it. */

/** "1" = exactly one order, "2+" / "5+" = at least that many (any status). */
export const ORDER_COUNT_FILTERS = ["1", "2+", "5+"] as const;

const text = (max: number) => z.string().trim().min(1).max(max).optional();
const rupees = z.coerce.number().min(0).max(100000000).optional();

export const customerListQuerySchema = z.object({
  q: text(100), // name, email or phone
  orders: z.enum(ORDER_COUNT_FILTERS).optional(),
  minPaid: rupees, // paid purchases in rupees, inclusive
  maxPaid: rupees,
  // Shipped there / bought it at least once (not cancelled). Places are read as the dashboard groups them.
  state: text(100),
  city: text(100),
  pincode: text(20),
  product: text(100),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

/** The filters (every URL key but the page). "Clear filters" empties all of them. */
export const CUSTOMER_FILTER_KEYS = Object.keys(customerListQuerySchema.shape).filter((k) => k !== "page") as Exclude<keyof CustomerListQuery, "page">[];

export const parseCustomerQuery = (params: Record<string, string | string[] | undefined>) => parseUrlQuery(customerListQuerySchema, [...CUSTOMER_FILTER_KEYS, "page"], params);
