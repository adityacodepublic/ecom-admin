import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { paiseToDecimalString } from "@/lib/money";
import { CANCELLED } from "@/lib/orders/status";
import { hasProduct, NOT_CANCELLED, shipToPlace } from "@/lib/orders/sql";
import type { CustomerListQuery } from "@/lib/customer-query";

/**
 * A store's customers = users with at least one order in THIS store (customers are global). Only this store's
 * orders are read. Paid purchases = paid, not cancelled orders, from their frozen totals.
 */

export const CUSTOMER_PAGE_SIZE = 50;

export type CustomerRow = {
  id: string; // the sign-in id: the store sends it to Clarity as the visitor's custom user ID
  fname: string;
  email: string;
  phone: string;
  address: string; // where the latest order went
  totalPrice: string; // paid purchases, rupees with paise, exact (e.g. "309.97")
  products: string; // what they bought (paid orders), "Name(count), ..."
  imgurl: string;
  orderCount: number;
};

/**
 * One page of the store's customers, newest first, with the search and the filters applied, all in one query:
 * the customers are grouped from this store's orders (count, amount paid, places, products), so no list of ids
 * goes back and forth. Then two small reads for just this page: what they bought and where their latest order went.
 */
export async function listStoreCustomers(storeId: string, q: CustomerListQuery): Promise<{ rows: CustomerRow[]; totalCount: number }> {
  const paid = Prisma.sql`COALESCE(SUM("total") FILTER (WHERE "paymentStatus" = 'PAID' AND ${NOT_CANCELLED}), 0)`;
  const having: Prisma.Sql[] = [Prisma.sql`true`];
  if (q.orders) having.push(q.orders === "1" ? Prisma.sql`count(*) = 1` : Prisma.sql`count(*) >= ${q.orders === "2+" ? 2 : 5}`);
  if (q.minPaid !== undefined) having.push(Prisma.sql`${paid} >= ${q.minPaid}`);
  if (q.maxPaid !== undefined) having.push(Prisma.sql`${paid} <= ${q.maxPaid}`);
  // "Shipped there" and "bought it" count the customer's orders that were not cancelled.
  for (const f of ["state", "city", "pincode"] as const) if (q[f] !== undefined) having.push(Prisma.sql`bool_or(${NOT_CANCELLED} AND ${shipToPlace(f)} = ${q[f] as string})`);
  if (q.product) having.push(Prisma.sql`bool_or(${NOT_CANCELLED} AND ${hasProduct(q.product)})`);
  const like = q.q ? `%${q.q}%` : null;

  const page = await prismadb.$queryRaw<{ id: string; fname: string; email: string; phone: string; imgurl: string | null; orders: number; paise: bigint; total: number }[]>`
    SELECT u."id", u."fname", u."email", u."phone", u."imgurl", c.orders, c.paise, count(*) OVER ()::int AS total
    FROM (
      SELECT "usersId" AS id, count(*)::int AS orders, (${paid} * 100)::bigint AS paise
      FROM "Order" WHERE "storeId" = ${storeId}
      GROUP BY "usersId" HAVING ${Prisma.join(having, " AND ")}
    ) c
    JOIN "Users" u ON u."id" = c.id
    WHERE ${like}::text IS NULL OR u."fname" ILIKE ${like} OR u."email" ILIKE ${like} OR u."phone" ILIKE ${like}
    ORDER BY u."createdAt" DESC, u."id" DESC
    LIMIT ${CUSTOMER_PAGE_SIZE} OFFSET ${(q.page - 1) * CUSTOMER_PAGE_SIZE}`;
  const ids = page.map((u) => u.id);
  if (ids.length === 0) return { rows: [], totalCount: 0 };

  const [bought, latest] = await Promise.all([
    // What each bought in paid, not cancelled orders: name and quantity.
    prismadb.$queryRaw<{ id: string; name: string; qty: number }[]>`
      SELECT o."usersId" AS id, i->>'name' AS name, SUM((i->>'quantity')::int)::int AS qty
      FROM "Order" o CROSS JOIN LATERAL jsonb_array_elements(o."details"->'items') i
      WHERE o."storeId" = ${storeId} AND o."usersId" = ANY(${ids}::text[]) AND o."paymentStatus" = 'PAID' AND o."status" <> ${CANCELLED}
      GROUP BY 1, 2`,
    // Where each one's latest order went.
    prismadb.$queryRaw<{ id: string; shipTo: Record<string, string> | null }[]>`
      SELECT DISTINCT ON ("usersId") "usersId" AS id, "details"->'shipTo' AS "shipTo"
      FROM "Order" WHERE "storeId" = ${storeId} AND "usersId" = ANY(${ids}::text[])
      ORDER BY "usersId", "createdAt" DESC`,
  ]);
  const products = new Map<string, string[]>();
  for (const b of [...bought].sort((x, y) => x.name.localeCompare(y.name))) products.set(b.id, [...(products.get(b.id) ?? []), `${b.name.slice(0, 30)}(${b.qty})`]);
  const address = new Map(latest.map((l) => [l.id, l.shipTo ? [l.shipTo.street, l.shipTo.city, l.shipTo.state, l.shipTo.pincode].filter(Boolean).join(", ") : ""]));

  return {
    totalCount: page[0].total,
    rows: page.map((u) => ({
      id: u.id,
      fname: u.fname,
      email: u.email,
      phone: u.phone,
      orderCount: u.orders,
      address: address.get(u.id) ?? "",
      products: (products.get(u.id) ?? []).join(", "),
      totalPrice: paiseToDecimalString(Number(u.paise)),
      imgurl: u.imgurl || "/white.png",
    })),
  };
}
