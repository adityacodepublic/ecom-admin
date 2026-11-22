import { Prisma } from "@prisma/client";

import { SHOP_TIME_ZONE } from "@/lib/shop-time";

import { CANCELLED } from "./status";

/**
 * SQL pieces over the "Order" table that several readers must spell the same way: a dashboard card, the Orders filter
 * it links to and the Customers filter count the same orders only while they share these. Use them with Prisma.sql.
 */

/** The place name used when an order has none saved (a blank field). Places are grouped and filtered by it. */
export const UNKNOWN_PLACE = "Unknown";

export type PlaceField = "state" | "city" | "pincode";

/** Where the order was shipped (frozen in details.shipTo), trimmed, blank = UNKNOWN_PLACE. */
export const shipToPlace = (field: PlaceField) => Prisma.sql`COALESCE(NULLIF(trim("details"->'shipTo'->>${Prisma.raw(`'${field}'`)}), ''), ${UNKNOWN_PLACE})`;

/** The order has a return (any return status; a return is not an order status). */
export const HAS_RETURN = Prisma.sql`jsonb_typeof("details"->'return') = 'object'`;

/** The order has this product among its items. */
export const hasProduct = (productId: string) => Prisma.sql`"details"->'items' @> jsonb_build_array(jsonb_build_object('productId', ${productId}::text))`;

export const NOT_CANCELLED = Prisma.sql`"status" <> ${CANCELLED}`;

/** When the order was placed, on the shop's clock ("createdAt" is a UTC timestamp without time zone). */
export const PLACED_SHOP_TIME = Prisma.sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SHOP_TIME_ZONE})`;
