import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { parseDetailsOrNull } from "@/lib/orders/details";
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
 * The customers the filters that need their orders keep (order count, amount paid, places, products), or null when
 * none of them is on. One grouped query over this store's orders.
 */
async function filteredCustomerIds(storeId: string, q: CustomerListQuery): Promise<string[] | null> {
  const having: Prisma.Sql[] = [];
  if (q.orders) having.push(q.orders === "1" ? Prisma.sql`count(*) = 1` : Prisma.sql`count(*) >= ${q.orders === "2+" ? 2 : 5}`);
  const paid = Prisma.sql`COALESCE(SUM("total") FILTER (WHERE "paymentStatus" = 'PAID' AND "status" <> ${CANCELLED}), 0)`;
  if (q.minPaid !== undefined) having.push(Prisma.sql`${paid} >= ${q.minPaid}`);
  if (q.maxPaid !== undefined) having.push(Prisma.sql`${paid} <= ${q.maxPaid}`);
  for (const f of ["state", "city", "pincode"] as const) if (q[f] !== undefined) having.push(Prisma.sql`bool_or(${NOT_CANCELLED} AND ${shipToPlace(f)} = ${q[f] as string})`);
  if (q.product) having.push(Prisma.sql`bool_or(${NOT_CANCELLED} AND ${hasProduct(q.product)})`);
  if (having.length === 0) return null;
  const rows = await prismadb.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "usersId" AS id FROM "Order" WHERE "storeId" = ${storeId} GROUP BY "usersId" HAVING ${Prisma.join(having, " AND ")}`,
  );
  return rows.map((r) => r.id);
}

export async function listStoreCustomers(storeId: string, q: CustomerListQuery): Promise<{ rows: CustomerRow[]; totalCount: number }> {
  const ids = await filteredCustomerIds(storeId, q);
  const where: Prisma.UsersWhereInput = {
    orders: { some: { storeId } },
    ...(ids ? { id: { in: ids } } : {}),
    ...(q.q ? { OR: (["fname", "email", "phone"] as const).map((f) => ({ [f]: { contains: q.q, mode: "insensitive" as const } })) } : {}),
  };
  const [totalCount, users] = await Promise.all([
    prismadb.users.count({ where }),
    prismadb.users.findMany({
      where,
      select: {
        id: true,
        fname: true,
        email: true,
        phone: true,
        imgurl: true,
        orders: { where: { storeId }, select: { id: true, total: true, paymentStatus: true, status: true, details: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
    }),
  ]);

  const rows = users.map((user): CustomerRow => {
    const paid = user.orders.filter((o) => o.paymentStatus === "PAID" && o.status !== CANCELLED);
    const productCount: Record<string, number> = {};
    for (const o of paid) {
      for (const item of parseDetailsOrNull(o.id, o.details)?.items ?? []) {
        const name = item.name.slice(0, 30);
        productCount[name] = (productCount[name] ?? 0) + item.quantity;
      }
    }
    const latest = parseDetailsOrNull(user.orders[0]?.id ?? "", user.orders[0]?.details);
    return {
      id: user.id,
      fname: user.fname,
      orderCount: user.orders.length,
      email: user.email,
      phone: user.phone,
      address: latest ? [latest.shipTo.street, latest.shipTo.city, latest.shipTo.state, latest.shipTo.pincode].filter(Boolean).join(", ") : "",
      products: Object.entries(productCount)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => `${name}(${count})`)
        .join(", "),
      totalPrice: paiseToDecimalString(sumPaise(paid.map((o) => toPaise(o.total)))),
      imgurl: user.imgurl || "/white.png",
    };
  });
  return { rows, totalCount };
}
