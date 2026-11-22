import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import { DAY_MS, shopDay, shopDayStart } from "@/lib/shop-time";

import { getOrderSettings, parseOrderSettings } from "./settings";
import { HAS_RETURN, NOT_CANCELLED, PLACED_SHOP_TIME, shipToPlace, UNKNOWN_PLACE } from "./sql";
import { CANCELLED } from "./status";

/**
 * Dashboard numbers, all from our own tables and all for ONE store (every query filters by storeId).
 * Same rule as Total Revenue: revenue = paymentStatus PAID, cancelled orders left out. "Orders" = not cancelled.
 * The database groups the rows; only small result sets come back.
 */

export const WINDOW_DAYS = 30; // the default range for orders / revenue / rates / delivery time
export const RANGE_OPTIONS = [7, 30, 90, 365] as const; // what the dashboard's range select offers

/** ?days= from the URL: one of RANGE_OPTIONS, else the default. */
export const parseRange = (v: unknown): number => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? n : WINDOW_DAYS;
};
export const WAITING_HOURS = 48; // an order not shipped yet after this long is "waiting too long"
export const LOW_STOCK_AT = 5; // in stock, at most this many left (Product.maxQuantity is "max per order", not a stock level)
export const DEAD_STOCK_DAYS = 60; // in stock, not ordered for this long
const TOP = 5;
const BUYER_LIST = 100; // buyers listed in the Buyers dialog, biggest spenders first

/**
 * "Last N days" = today and the N-1 days before it, as whole days in India time. The first day is also what the
 * Orders page filter "from" takes, so a card and the list it links to cover exactly the same orders.
 */
function rangeStart(days: number) {
  const first = shopDay(Date.now() - (days - 1) * DAY_MS);
  return { from: first, since: shopDayStart(first) };
}

type OrderRef = { id: string; orderNumber: number; customer: string; paise: number; at: string };
type ReasonRow = { reason: string; n: number; id: string; orderNumber: number; cname: string | null; paise: bigint; placed: Date };
const REASON_ORDERS = 25; // orders listed per reason in the dialog
const DELIVERY_LIST = 100; // delivered orders listed in the "Time to delivery" dialog (the average counts all of them)
type DeliveryRow = { id: string; orderNumber: number; cname: string | null; placed: Date; delivered: Date; total: number; avgSecs: number };

/** Rows (one per order, newest first within a reason) -> the reasons, most common first, each with its orders. */
function groupReasons(rows: ReasonRow[]) {
  const m = new Map<string, { reason: string; n: number; orders: OrderRef[] }>();
  for (const r of rows) {
    const g = m.get(r.reason) ?? { reason: r.reason, n: r.n, orders: [] };
    g.orders.push({ id: r.id, orderNumber: r.orderNumber, customer: r.cname?.trim() || "Customer", paise: Number(r.paise), at: r.placed.toISOString() });
    m.set(r.reason, g);
  }
  return Array.from(m.values()).sort((a, b) => b.n - a.n);
}
// "createdAt" is a UTC timestamp without time zone: compare it with an explicit UTC instant.
const utc = (d: Date) => d.toISOString();

/**
 * Adds the rows that share a place (the key), busiest first. `filter` = the Orders page filters that list exactly those
 * orders (the link on the card), e.g. { city: "Pune", state: "Maharashtra" }.
 */
function topPlaces<T extends { orders: number; paise: bigint }>(rows: T[], key: (r: T) => string, filter: (r: T) => Record<string, string>) {
  const m = new Map<string, { orders: number; paise: number; filter: Record<string, string> }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { orders: 0, paise: 0, filter: filter(r) };
    m.set(k, { orders: cur.orders + r.orders, paise: cur.paise + Number(r.paise), filter: cur.filter });
  }
  return Array.from(m, ([place, v]) => ({ place, ...v }))
    .sort((a, b) => b.orders - a.orders || b.paise - a.paise)
    .slice(0, TOP);
}

export type StoreAnalytics = Awaited<ReturnType<typeof getStoreAnalytics>>;

export async function getStoreAnalytics(storeId: string, days: number = WINDOW_DAYS) {
  const { from, since } = rangeStart(days);
  const sinceSql = utc(since);
  const inRange = Prisma.sql`"createdAt" >= (${sinceSql}::timestamptz AT TIME ZONE 'UTC')`;
  const deadSince = new Date(Date.now() - DEAD_STOCK_DAYS * DAY_MS);
  const liveProduct = { storeId, isArchived: false };
  const lowWhere = { ...liveProduct, quantity: { gt: 0, lte: LOW_STOCK_AT } };
  const outWhere = { ...liveProduct, quantity: { lte: 0 } };
  const deadWhere = {
    ...liveProduct,
    quantity: { gt: 0 },
    createdAt: { lt: deadSince },
    orderItems: { none: { order: { status: { not: CANCELLED }, createdAt: { gte: deadSince } } } },
  };
  const pick = { select: { id: true, name: true, quantity: true }, take: TOP };

  // Everything starts at once. Only the delivery and waiting reads need the store's status list, and only the buyers'
  // names need the top buyers: those wait for just what they need.
  const statusesP = getOrderSettings(storeId).then((s) => (s ?? parseOrderSettings(null)).statuses);
  const deliveryP = statusesP.then((statuses) => {
    const final = statuses[statuses.length - 1];
    // Orders at the final stage that got there in the range: placed -> the first event of that status. The count and the
    // average are over all of them (window functions run before the LIMIT); only the newest DELIVERY_LIST come back.
    return prismadb.$queryRaw<DeliveryRow[]>`
      WITH d AS (
        SELECT o."id", o."orderNumber", MAX(o."details"->'shipTo'->>'name') AS cname,
               (o."createdAt" AT TIME ZONE 'UTC') AS placed, min((e->>'at')::timestamptz) AS delivered
        FROM "Order" o
        CROSS JOIN LATERAL jsonb_array_elements(o."details"->'events') e
        WHERE o."storeId" = ${storeId} AND o."status" = ${final}
          AND e->>'type' = 'status' AND e->>'status' = ${final}
        GROUP BY o."id", o."orderNumber", o."createdAt"
        HAVING min((e->>'at')::timestamptz) >= ${sinceSql}::timestamptz
      )
      SELECT *, count(*) OVER ()::int AS total, (avg(extract(epoch FROM delivered - placed)) OVER ())::float8 AS "avgSecs"
      FROM d ORDER BY delivered DESC LIMIT ${DELIVERY_LIST}`;
  });
  const waitingP = statusesP.then((statuses) => {
    const shipAt = statuses.findIndex((s) => /ship/i.test(s));
    const unshipped = shipAt > 0 ? statuses.slice(0, shipAt) : statuses.slice(0, 1); // statuses before "Shipped" (or just the first)
    const where = { storeId, status: { in: unshipped }, createdAt: { lt: new Date(Date.now() - WAITING_HOURS * 60 * 60 * 1000) } };
    const count = prismadb.order.count({ where });
    const oldest = prismadb.order.findMany({ where, select: { id: true, orderNumber: true, createdAt: true, status: true }, orderBy: { createdAt: "asc" }, take: 10 });
    return Promise.all([count, oldest] as const);
  });
  // The buyers dialog lists up to BUYER_LIST buyers, biggest spenders first (all time, cancelled orders left out).
  const topBuyersP = prismadb.order
    .groupBy({
      by: ["usersId"],
      where: { storeId, status: { not: CANCELLED } },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
      orderBy: { _sum: { total: "desc" } },
      take: BUYER_LIST,
    })
    .then(async (top) => ({
      top,
      users: await prismadb.users.findMany({ where: { id: { in: top.map((b) => b.usersId) } }, select: { id: true, fname: true, email: true, phone: true } }),
    }));

  const [statuses, paid, totalOrders, cancelled, products, cancelRows, returnRows, delivery, geo, buyerCounts, topBuyers, when, [waitingCount, waiting], stock] = await Promise.all(
    [
      statusesP,
      prismadb.order.aggregate({
        where: { storeId, paymentStatus: "PAID", status: { not: CANCELLED }, createdAt: { gte: since } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prismadb.order.count({ where: { storeId, createdAt: { gte: since } } }),
      prismadb.order.count({ where: { storeId, status: CANCELLED, createdAt: { gte: since } } }),
      // Per product: units and revenue from the frozen price on the order (details.items), with its category.
      prismadb.$queryRaw<{ id: string; name: string; category: string | null; units: number; paise: bigint }[]>`
      SELECT i->>'productId' AS id, MAX(i->>'name') AS name, MAX(c."name") AS category,
             SUM((i->>'quantity')::int)::int AS units,
             SUM((i->>'pricePaise')::bigint * (i->>'quantity')::int)::bigint AS paise
      FROM "Order" o
      CROSS JOIN LATERAL jsonb_array_elements(o."details"->'items') i
      LEFT JOIN "Product" p ON p."id" = i->>'productId'
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      WHERE o."storeId" = ${storeId} AND o."paymentStatus" = 'PAID' AND o."status" <> ${CANCELLED}
        AND o."createdAt" >= (${sinceSql}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY i->>'productId'`,
      // One row per cancelled order (its latest "Cancelled" event). Customer cancellations carry the reason in the event
      // message; admin cancellations have none. n = orders with the same reason; only the newest REASON_ORDERS per reason come back.
      prismadb.$queryRaw<ReasonRow[]>`
      WITH c AS (
        SELECT DISTINCT ON (o."id") o."id", o."orderNumber", o."details"->'shipTo'->>'name' AS cname,
               (o."createdAt" AT TIME ZONE 'UTC') AS placed, (o."total" * 100)::bigint AS paise,
               CASE WHEN e->>'actor' = 'customer'
                    THEN COALESCE(NULLIF(trim(substring(e->>'message' from 'Cancelled by customer: (.*)')), ''), 'No reason given')
                    ELSE 'Cancelled by the store' END AS reason
        FROM "Order" o
        CROSS JOIN LATERAL jsonb_array_elements(o."details"->'events') e
        WHERE o."storeId" = ${storeId} AND o."status" = ${CANCELLED}
          AND o."createdAt" >= (${sinceSql}::timestamptz AT TIME ZONE 'UTC')
          AND e->>'type' = 'status' AND e->>'status' = ${CANCELLED}
        ORDER BY o."id", (e->>'at') DESC
      ), r AS (
        SELECT c.*, count(*) OVER (PARTITION BY reason)::int AS n, row_number() OVER (PARTITION BY reason ORDER BY placed DESC) AS rn FROM c
      )
      SELECT reason, n, "id", "orderNumber", cname, paise, placed FROM r WHERE rn <= ${REASON_ORDERS} ORDER BY n DESC, reason, rn`,
      prismadb.$queryRaw<ReasonRow[]>`
      WITH c AS (
        SELECT "id", "orderNumber", "details"->'shipTo'->>'name' AS cname, ("createdAt" AT TIME ZONE 'UTC') AS placed, ("total" * 100)::bigint AS paise,
               COALESCE(NULLIF(trim("details"->'return'->>'reason'), ''), 'No reason given') AS reason
        FROM "Order"
        WHERE "storeId" = ${storeId} AND ${HAS_RETURN} AND ${inRange}
      ), r AS (
        SELECT c.*, count(*) OVER (PARTITION BY reason)::int AS n, row_number() OVER (PARTITION BY reason ORDER BY placed DESC) AS rn FROM c
      )
      SELECT reason, n, "id", "orderNumber", cname, paise, placed FROM r WHERE rn <= ${REASON_ORDERS} ORDER BY n DESC, reason, rn`,
      deliveryP,
      // Where orders were shipped to (frozen in details.shipTo). One row per state + city + pincode: the state, city and
      // pincode lists below are made from these rows. Orders placed before the address was split have no state or city.
      prismadb.$queryRaw<{ state: string; city: string; pincode: string; orders: number; paise: bigint }[]>`
      SELECT ${shipToPlace("state")} AS state, ${shipToPlace("city")} AS city, ${shipToPlace("pincode")} AS pincode,
             count(*)::int AS orders,
             (COALESCE(SUM("total") FILTER (WHERE "paymentStatus" = 'PAID'), 0) * 100)::bigint AS paise
      FROM "Order"
      WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} AND ${inRange}
      GROUP BY 1, 2, 3`,
      // How many buyers the store has, and how many ordered more than once (all time, cancelled orders left out).
      prismadb.$queryRaw<{ total: number; repeat: number }[]>`
      SELECT count(*)::int AS total, (count(*) FILTER (WHERE n > 1))::int AS repeat
      FROM (SELECT count(*) AS n FROM "Order" WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} GROUP BY "usersId") b`,
      topBuyersP,
      // When orders were placed, on the shop's clock: weekday (0 = Sunday) and hour (0-23), cancelled orders left out.
      prismadb.$queryRaw<{ dow: number; hour: number; n: number }[]>`
      SELECT EXTRACT(DOW FROM ${PLACED_SHOP_TIME})::int AS dow, EXTRACT(HOUR FROM ${PLACED_SHOP_TIME})::int AS hour, count(*)::int AS n
      FROM "Order"
      WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} AND ${inRange}
      GROUP BY 1, 2`,
      waitingP,
      Promise.all([
        prismadb.product.count({ where: lowWhere }),
        prismadb.product.findMany({ where: lowWhere, orderBy: { quantity: "asc" }, ...pick }),
        prismadb.product.count({ where: outWhere }),
        prismadb.product.findMany({ where: outWhere, orderBy: { updatedAt: "desc" }, ...pick }),
        prismadb.product.count({ where: deadWhere }),
        prismadb.product.findMany({ where: deadWhere, orderBy: { quantity: "desc" }, ...pick }),
      ]),
    ],
  );
  const [lowCount, low, outCount, out, deadCount, dead] = stock;

  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  for (const w of when) {
    byHour[w.hour] += w.n;
    byWeekday[w.dow] += w.n;
  }
  const byProduct = products.map((p) => ({ id: p.id, name: p.name, category: p.category ?? "No category", units: p.units, paise: Number(p.paise) }));
  const categories = new Map<string, number>();
  for (const p of byProduct) categories.set(p.category, (categories.get(p.category) ?? 0) + p.paise);
  const cancelReasons = groupReasons(cancelRows);
  const returnReasons = groupReasons(returnRows);
  const returned = returnReasons.reduce((n, r) => n + r.n, 0);
  const paidCount = paid._count._all;
  const paidPaise = toPaise(paid._sum.total ?? "0");
  const users = new Map(topBuyers.users.map((u) => [u.id, u]));
  const unknownCity = (g: { city: string }) => g.city === UNKNOWN_PLACE;

  return {
    windowDays: days,
    from, // first day of the range (YYYY-MM-DD, shop time): the Orders page filter "from" for the same orders
    finalStatus: statuses[statuses.length - 1],
    revenue: { orders: paidCount, averagePaise: paidCount ? Math.round(paidPaise / paidCount) : 0 },
    topProducts: {
      byUnits: [...byProduct].sort((a, b) => b.units - a.units).slice(0, TOP),
      byRevenue: [...byProduct].sort((a, b) => b.paise - a.paise).slice(0, TOP),
    },
    categories: Array.from(categories, ([category, paise]) => ({ category, paise }))
      .sort((a, b) => b.paise - a.paise)
      .slice(0, TOP),
    waiting: {
      hours: WAITING_HOURS,
      count: waitingCount,
      orders: waiting.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, ageHours: Math.floor((Date.now() - o.createdAt.getTime()) / 3600000) })),
    },
    cancelled: { count: cancelled, orders: totalOrders, reasons: cancelReasons.slice(0, TOP) },
    returned: { count: returned, orders: totalOrders - cancelled, reasons: returnReasons.slice(0, TOP) },
    stock: { low: { count: lowCount, items: low }, out: { count: outCount, items: out }, dead: { count: deadCount, items: dead, days: DEAD_STOCK_DAYS }, lowAt: LOW_STOCK_AT },
    buyers: {
      total: buyerCounts[0]?.total ?? 0,
      repeat: buyerCounts[0]?.repeat ?? 0,
      top: topBuyers.top.map((b) => {
        const u = users.get(b.usersId);
        return {
          id: b.usersId,
          name: u?.fname || u?.email || "Customer",
          email: u?.email ?? "",
          phone: u?.phone ?? "",
          orders: b._count._all,
          paise: toPaise(b._sum.total ?? "0"),
          lastOrderAt: b._max.createdAt?.toISOString() ?? null,
        };
      }),
    },
    when: { byHour, byWeekday, total: byHour.reduce((a, b) => a + b, 0) },
    geography: {
      states: topPlaces(
        geo,
        (g) => g.state,
        (g) => ({ state: g.state }),
      ),
      cities: topPlaces(
        geo,
        (g) => (unknownCity(g) ? UNKNOWN_PLACE : `${g.city}, ${g.state}`),
        (g): Record<string, string> => (unknownCity(g) ? { city: UNKNOWN_PLACE } : { city: g.city, state: g.state }),
      ),
      pincodes: topPlaces(
        geo,
        (g) => g.pincode,
        (g) => ({ pincode: g.pincode }),
      ),
    },
    delivery: {
      count: delivery[0]?.total ?? 0,
      hours: (delivery[0]?.avgSecs ?? 0) / 3600,
      // Newest first, at most DELIVERY_LIST. The dialog lists these; the average above is over all of them.
      orders: delivery.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        customer: r.cname?.trim() || "Customer",
        placed: r.placed.toISOString(),
        delivered: r.delivered.toISOString(),
        hours: (r.delivered.getTime() - r.placed.getTime()) / 3600000,
      })),
    },
  };
}
