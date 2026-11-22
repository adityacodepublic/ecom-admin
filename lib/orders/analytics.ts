import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { cachedPerStore } from "@/lib/cache";
import { toPaise } from "@/lib/money";
import { DAY_MS, shopDay, shopDayStart } from "@/lib/shop-time";

import { INSIGHT_LIMITS } from "./insight-limits";
import { getOrderSettings, parseOrderSettings, waitingStatuses, type OrderSettings } from "./settings";
import { HAS_RETURN, NOT_CANCELLED, PLACED_SHOP_TIME, shipToPlace, UNKNOWN_PLACE } from "./sql";
import { CANCELLED } from "./status";

/**
 * Dashboard numbers, all from our own tables and all for ONE store (every query filters by storeId).
 * Same rule as Total Revenue: revenue = paymentStatus PAID, cancelled orders left out. "Orders" = not cancelled.
 * The database groups the rows; only small result sets come back. The cards get counts; the rows behind a card
 * (a reason's orders, the delivered orders, a group of buyers) are read only when its dialog opens (list* below).
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

// How long the parts that do not depend on the range are kept (see lib/cache.ts).
const STOCK_SECONDS = 120; // stock: the owner acts on it, so at most two minutes old
const BUYERS_SECONDS = 300; // all-time buyer counts move slowly

/**
 * "Last N days" = today and the N-1 days before it, as whole days in India time. The first day is also what the
 * Orders page filter "from" takes, so a card and the list it links to cover exactly the same orders.
 */
function rangeStart(days: number) {
  const first = shopDay(Date.now() - (days - 1) * DAY_MS);
  return { from: first, since: shopDayStart(first) };
}

// "createdAt" is a UTC timestamp without time zone: compare it with an explicit UTC instant.
const placedSince = (since: Date, alias = "") =>
  Prisma.sql`${Prisma.raw(alias ? `${alias}."createdAt"` : `"createdAt"`)} >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const customerName = (name: string | null) => name?.trim() || "Customer";

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

// ---------------------------------------------------------------- reasons (cancelled / returned orders)

export type ReasonKind = "cancel" | "return";

/**
 * One row per cancelled (or returned) order placed since `since`, with its reason. A customer cancellation carries the
 * reason in its latest "Cancelled" event message; an admin cancellation has none. A return keeps its own reason.
 */
const reasonRows = (storeId: string, kind: ReasonKind, since: Date) =>
  kind === "cancel"
    ? Prisma.sql`
      SELECT DISTINCT ON (o."id") o."id", o."orderNumber", o."details"->'shipTo'->>'name' AS cname,
             (o."createdAt" AT TIME ZONE 'UTC') AS placed, (o."total" * 100)::bigint AS paise,
             CASE WHEN e->>'actor' = 'customer'
                  THEN COALESCE(NULLIF(trim(substring(e->>'message' from 'Cancelled by customer: (.*)')), ''), 'No reason given')
                  ELSE 'Cancelled by the store' END AS reason
      FROM "Order" o
      CROSS JOIN LATERAL jsonb_array_elements(o."details"->'events') e
      WHERE o."storeId" = ${storeId} AND o."status" = ${CANCELLED} AND ${placedSince(since, "o")}
        AND e->>'type' = 'status' AND e->>'status' = ${CANCELLED}
      ORDER BY o."id", (e->>'at') DESC`
    : Prisma.sql`
      SELECT "id", "orderNumber", "details"->'shipTo'->>'name' AS cname, ("createdAt" AT TIME ZONE 'UTC') AS placed, ("total" * 100)::bigint AS paise,
             COALESCE(NULLIF(trim("details"->'return'->>'reason'), ''), 'No reason given') AS reason
      FROM "Order"
      WHERE "storeId" = ${storeId} AND ${HAS_RETURN} AND ${placedSince(since)}`;

/** Every reason with its number of orders, most common first. */
const reasonCounts = (storeId: string, kind: ReasonKind, since: Date) =>
  prismadb.$queryRaw<{ reason: string; n: number }[]>`SELECT reason, count(*)::int AS n FROM (${reasonRows(storeId, kind, since)}) r GROUP BY reason ORDER BY n DESC, reason`;

/** A reason's dialog: its newest orders (up to INSIGHT_LIMITS.reasonOrders) and how many it has in all. `from` = the range's first day. */
export async function listReasonOrders(storeId: string, kind: ReasonKind, reason: string, from: string) {
  const rows = await prismadb.$queryRaw<{ id: string; orderNumber: number; cname: string | null; placed: Date; paise: bigint; total: number }[]>`
    SELECT *, count(*) OVER ()::int AS total FROM (${reasonRows(storeId, kind, shopDayStart(from))}) r
    WHERE reason = ${reason} ORDER BY placed DESC LIMIT ${INSIGHT_LIMITS.reasonOrders}`;
  return {
    total: rows[0]?.total ?? 0,
    orders: rows.map((r) => ({ id: r.id, orderNumber: r.orderNumber, customer: customerName(r.cname), paise: Number(r.paise), at: r.placed.toISOString() })),
  };
}

// ---------------------------------------------------------------- delivery time

/** Orders at the final stage that got there since `since`, one row each: placed -> the first event of that status. */
const deliveredRows = (storeId: string, final: string, since: Date) => Prisma.sql`
  SELECT o."id", o."orderNumber", MAX(o."details"->'shipTo'->>'name') AS cname,
         (o."createdAt" AT TIME ZONE 'UTC') AS placed, min((e->>'at')::timestamptz) AS delivered
  FROM "Order" o
  CROSS JOIN LATERAL jsonb_array_elements(o."details"->'events') e
  WHERE o."storeId" = ${storeId} AND o."status" = ${final}
    AND e->>'type' = 'status' AND e->>'status' = ${final}
  GROUP BY o."id", o."orderNumber", o."createdAt"
  HAVING min((e->>'at')::timestamptz) >= ${since.toISOString()}::timestamptz`;

const finalStatusOf = async (storeId: string) => {
  const { statuses } = (await getOrderSettings(storeId)) ?? parseOrderSettings(null);
  return statuses[statuses.length - 1];
};

/** The "Time to delivery" dialog: the newest delivered orders (up to INSIGHT_LIMITS.delivered) with how long each took. */
export async function listDelivered(storeId: string, from: string) {
  const rows = await prismadb.$queryRaw<{ id: string; orderNumber: number; cname: string | null; placed: Date; delivered: Date }[]>`
    SELECT * FROM (${deliveredRows(storeId, await finalStatusOf(storeId), shopDayStart(from))}) d ORDER BY delivered DESC LIMIT ${INSIGHT_LIMITS.delivered}`;
  return {
    orders: rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      customer: customerName(r.cname),
      placed: r.placed.toISOString(),
      delivered: r.delivered.toISOString(),
      hours: (r.delivered.getTime() - r.placed.getTime()) / 3600000,
    })),
  };
}

// ---------------------------------------------------------------- buyers (all time, cancelled orders left out)

export type BuyerGroup = "new" | "repeat";

/** Buyers with their orders and spend, biggest spenders first. `having` picks the group. */
const buyerRows = (storeId: string, having: Prisma.Sql, limit: number) =>
  prismadb.$queryRaw<{ id: string; orders: number; paise: bigint; last: Date; fname: string; email: string; phone: string }[]>`
    SELECT o."usersId" AS id, count(*)::int AS orders, (sum(o."total") * 100)::bigint AS paise, max(o."createdAt") AS last, u."fname", u."email", u."phone"
    FROM "Order" o JOIN "Users" u ON u."id" = o."usersId"
    WHERE o."storeId" = ${storeId} AND o."status" <> ${CANCELLED}
    GROUP BY o."usersId", u."fname", u."email", u."phone"
    HAVING ${having}
    ORDER BY paise DESC LIMIT ${limit}`.then((rows) =>
    rows.map((b) => ({
      id: b.id,
      name: b.fname || b.email || "Customer",
      email: b.email,
      phone: b.phone,
      orders: b.orders,
      paise: Number(b.paise),
      lastOrderAt: b.last.toISOString(),
    })),
  );

/** A Buyers dialog: one group's biggest spenders (up to INSIGHT_LIMITS.buyers). */
export const listBuyers = (storeId: string, group: BuyerGroup) =>
  buyerRows(storeId, group === "repeat" ? Prisma.sql`count(*) > 1` : Prisma.sql`count(*) = 1`, INSIGHT_LIMITS.buyers);

/** The Buyers card: how many, how many came back, and the top spenders. */
const buyerSummary = cachedPerStore("analytics-buyers", BUYERS_SECONDS, async (storeId) => {
  const [counts, top] = await Promise.all([
    prismadb.$queryRaw<{ total: number; repeat: number }[]>`
      SELECT count(*)::int AS total, (count(*) FILTER (WHERE n > 1))::int AS repeat
      FROM (SELECT count(*) AS n FROM "Order" WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} GROUP BY "usersId") b`,
    buyerRows(storeId, Prisma.sql`true`, TOP),
  ]);
  return { total: counts[0]?.total ?? 0, repeat: counts[0]?.repeat ?? 0, top };
});

// ---------------------------------------------------------------- waiting orders and stock (no range)

/**
 * "Orders waiting too long": placed WAITING_HOURS ago or more and not yet at the status picked on the card
 * (settings.waitingUntil). Not cached: picking another status on the card shows its orders at once.
 */
async function waitingOrders(storeId: string, settings: OrderSettings) {
  const where = { storeId, status: { in: waitingStatuses(settings) }, createdAt: { lt: new Date(Date.now() - WAITING_HOURS * 60 * 60 * 1000) } };
  const [count, oldest] = await Promise.all([
    prismadb.order.count({ where }),
    prismadb.order.findMany({ where, select: { id: true, orderNumber: true, createdAt: true, status: true }, orderBy: { createdAt: "asc" }, take: 10 }),
  ]);
  return {
    hours: WAITING_HOURS,
    status: settings.waitingUntil, // the card's pick
    statuses: settings.statuses, // what it can pick from
    count,
    orders: oldest.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, ageHours: Math.floor((Date.now() - o.createdAt.getTime()) / 3600000) })),
  };
}

const stockSummary = cachedPerStore("analytics-stock", STOCK_SECONDS, async (storeId) => {
  const deadSince = new Date(Date.now() - DEAD_STOCK_DAYS * DAY_MS);
  const live = { storeId, isArchived: false };
  const lowWhere = { ...live, quantity: { gt: 0, lte: LOW_STOCK_AT } };
  const outWhere = { ...live, quantity: { lte: 0 } };
  const deadWhere = { ...live, quantity: { gt: 0 }, createdAt: { lt: deadSince }, orderItems: { none: { order: { status: { not: CANCELLED }, createdAt: { gte: deadSince } } } } };
  const pick = { select: { id: true, name: true, quantity: true }, take: TOP };
  const [lowCount, low, outCount, out, deadCount, dead] = await Promise.all([
    prismadb.product.count({ where: lowWhere }),
    prismadb.product.findMany({ where: lowWhere, orderBy: { quantity: "asc" }, ...pick }),
    prismadb.product.count({ where: outWhere }),
    prismadb.product.findMany({ where: outWhere, orderBy: { updatedAt: "desc" }, ...pick }),
    prismadb.product.count({ where: deadWhere }),
    prismadb.product.findMany({ where: deadWhere, orderBy: { quantity: "desc" }, ...pick }),
  ]);
  return { low: { count: lowCount, items: low }, out: { count: outCount, items: out }, dead: { count: deadCount, items: dead, days: DEAD_STOCK_DAYS }, lowAt: LOW_STOCK_AT };
});

// ---------------------------------------------------------------- the dashboard

export type StoreAnalytics = Awaited<ReturnType<typeof getStoreAnalytics>>;

export async function getStoreAnalytics(storeId: string, days: number = WINDOW_DAYS) {
  const { from, since } = rangeStart(days);
  const inRange = placedSince(since);
  const settingsP = getOrderSettings(storeId).then((s) => s ?? parseOrderSettings(null));
  const statusesP = settingsP.then((s) => s.statuses);

  const [statuses, paid, totalOrders, cancelled, products, cancelReasons, returnReasons, delivery, geo, when, waiting, stock, buyers] = await Promise.all([
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
      WHERE o."storeId" = ${storeId} AND o."paymentStatus" = 'PAID' AND o."status" <> ${CANCELLED} AND ${placedSince(since, "o")}
      GROUP BY i->>'productId'`,
    reasonCounts(storeId, "cancel", since),
    reasonCounts(storeId, "return", since),
    // Count and average only: the dialog reads the orders (listDelivered).
    statusesP.then(
      (st) => prismadb.$queryRaw<{ n: number; secs: number | null }[]>`
        SELECT count(*)::int AS n, avg(extract(epoch FROM delivered - placed))::float8 AS secs FROM (${deliveredRows(storeId, st[st.length - 1], since)}) d`,
    ),
    // Where orders were shipped to (frozen in details.shipTo). One row per state + city + pincode: the state, city and
    // pincode lists below are made from these rows. Orders placed before the address was split have no state or city.
    prismadb.$queryRaw<{ state: string; city: string; pincode: string; orders: number; paise: bigint }[]>`
      SELECT ${shipToPlace("state")} AS state, ${shipToPlace("city")} AS city, ${shipToPlace("pincode")} AS pincode,
             count(*)::int AS orders,
             (COALESCE(SUM("total") FILTER (WHERE "paymentStatus" = 'PAID'), 0) * 100)::bigint AS paise
      FROM "Order"
      WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} AND ${inRange}
      GROUP BY 1, 2, 3`,
    // When orders were placed, on the shop's clock: weekday (0 = Sunday) and hour (0-23), cancelled orders left out.
    prismadb.$queryRaw<{ dow: number; hour: number; n: number }[]>`
      SELECT EXTRACT(DOW FROM ${PLACED_SHOP_TIME})::int AS dow, EXTRACT(HOUR FROM ${PLACED_SHOP_TIME})::int AS hour, count(*)::int AS n
      FROM "Order"
      WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED} AND ${inRange}
      GROUP BY 1, 2`,
    settingsP.then((s) => waitingOrders(storeId, s)),
    stockSummary(storeId),
    buyerSummary(storeId),
  ]);

  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  for (const w of when) {
    byHour[w.hour] += w.n;
    byWeekday[w.dow] += w.n;
  }
  const byProduct = products.map((p) => ({ id: p.id, name: p.name, category: p.category ?? "No category", units: p.units, paise: Number(p.paise) }));
  const categories = new Map<string, number>();
  for (const p of byProduct) categories.set(p.category, (categories.get(p.category) ?? 0) + p.paise);
  const paidCount = paid._count._all;
  const paidPaise = toPaise(paid._sum.total ?? "0");
  const unknownCity = (g: { city: string }) => g.city === UNKNOWN_PLACE;
  const sum = (rows: { n: number }[]) => rows.reduce((n, r) => n + r.n, 0);

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
    waiting,
    cancelled: { count: cancelled, orders: totalOrders, reasons: cancelReasons.slice(0, TOP) },
    returned: { count: sum(returnReasons), orders: totalOrders - cancelled, reasons: returnReasons.slice(0, TOP) },
    stock,
    buyers,
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
    delivery: { count: delivery[0]?.n ?? 0, hours: (delivery[0]?.secs ?? 0) / 3600 },
  };
}
