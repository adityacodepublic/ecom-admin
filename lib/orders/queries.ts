import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import { nextShopDayStart, SHOP_UTC_OFFSET_MS, shopDayStart, todayShop } from "@/lib/shop-time";
import { CustomerOrderEvent, OrderCharge, OrderDetails, OrderEvent, OrderMoney, QuoteState, ShipTo, customerEvents, parseDetails, parseDetailsOrNull, reachedStatusAt } from "./details";
import { OrderError } from "./errors";
import { OrderSettings, getOrderSettings, parseOrderSettings } from "./settings";
import {
  CANCELLED,
  OrderStatus,
  PAYMENT_STATUSES,
  PaymentStatus,
  STATUS_LABEL_MAX,
  StatusLock,
  mayWithdrawReturn,
  statusLock,
  isCancelled,
  isQuote,
  QUOTE,
  isFinalStatus,
  isRejected,
  nextStatus,
  normalizePaymentStatus,
  prevStatus,
  statusOptions,
} from "./status";
import { OrderRef } from "./update";
import { orderListQuerySchema, type OrderListQuery } from "./list-query";
import { HAS_RETURN, hasProduct, NOT_CANCELLED, PLACED_SHOP_TIME, shipToPlace, UNKNOWN_PLACE } from "./sql";

// The query shape lives in ./list-query (no database import, so client components can share it).
export { ADMIN_LIST_KEYS, DELIVERY_FILTERS, orderListQuerySchema, type OrderListQuery } from "./list-query";

/** Read side. Admin views include everything; customer views are built field by field (allow-list). */

// ---------------------------------------------------------------- filters

/** URLSearchParams -> checked query (empty values ignored). Throws OrderError VALIDATION. */
export function parseListQuery(params: URLSearchParams, allow: (keyof OrderListQuery)[]): OrderListQuery {
  const raw: Record<string, string> = {};
  for (const key of allow) {
    const v = params.get(key);
    if (v !== null && v !== "") raw[key] = v;
  }
  const r = orderListQuerySchema.safeParse(raw);
  if (!r.success) throw new OrderError("VALIDATION", "Invalid filter", r.error.flatten());
  return r.data;
}

/** "createdAt" is a UTC timestamp without time zone: compare it with an explicit UTC instant. */
const atOrAfter = (d: Date) => Prisma.sql`"createdAt" >= (${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const before = (d: Date) => Prisma.sql`"createdAt" < (${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** The search box: "#1042" is that order number only; anything else is text found in the customer or the receiver (a plain number also matches the order number). */
function searchSql(text: string): Prisma.Sql {
  const t = text.replace(/^#/, "").trim();
  const number = /^\d{1,9}$/.test(t) ? Number(t) : null;
  if (text.startsWith("#")) return number === null ? Prisma.sql`false` : Prisma.sql`"orderNumber" = ${number}`;
  const like = `%${t}%`;
  const or = [
    Prisma.sql`EXISTS (SELECT 1 FROM "Users" u WHERE u."id" = "Order"."usersId" AND (u."fname" ILIKE ${like} OR u."email" ILIKE ${like} OR u."phone" ILIKE ${like}))`,
    Prisma.sql`"details"->'shipTo'->>'name' ILIKE ${like}`,
    Prisma.sql`"details"->'shipTo'->>'phone' ILIKE ${like}`,
  ];
  if (number !== null) or.push(Prisma.sql`"orderNumber" = ${number}`);
  return Prisma.sql`(${Prisma.join(or, " OR ")})`;
}

/**
 * Every Orders filter but the status, as one SQL condition over "Order", so the list, its count and the per-status
 * counts are each one query (no list of ids goes back and forth, whatever the store's size). Places are read as the
 * dashboard groups them (lib/orders/sql). With a place, buyer, hour or weekday filter and no status filter, cancelled
 * orders are left out, as on the dashboard (which counts those without them); `excludesCancelled` says so.
 * `steps` gives the status list (only the Delivery filter needs it).
 */
async function orderListWhere(storeId: string, q: OrderListQuery, steps: () => Promise<OrderStatus[]>): Promise<{ where: Prisma.Sql; excludesCancelled: boolean }> {
  const conds: Prisma.Sql[] = [Prisma.sql`"storeId" = ${storeId}`];
  if (q.q) conds.push(searchSql(q.q));
  if (q.paymentStatus) conds.push(Prisma.sql`"paymentStatus" = ${q.paymentStatus}`);
  if (q.minTotal !== undefined) conds.push(Prisma.sql`"total" >= ${q.minTotal}`);
  if (q.maxTotal !== undefined) conds.push(Prisma.sql`"total" <= ${q.maxTotal}`);
  if (q.from) conds.push(atOrAfter(shopDayStart(q.from)));
  if (q.to) conds.push(before(nextShopDayStart(q.to)));
  if (q.returned) conds.push(HAS_RETURN);
  const places = (["state", "city", "pincode"] as const).filter((f) => q[f] !== undefined);
  for (const f of places) conds.push(Prisma.sql`${shipToPlace(f)} = ${q[f] as string}`);
  if (q.buyer) conds.push(Prisma.sql`"usersId" = ${q.buyer}`);
  if (q.hour !== undefined) conds.push(Prisma.sql`EXTRACT(HOUR FROM ${PLACED_SHOP_TIME})::int = ${q.hour}`);
  if (q.weekday !== undefined) conds.push(Prisma.sql`EXTRACT(DOW FROM ${PLACED_SHOP_TIME})::int = ${q.weekday}`);
  if (q.product) conds.push(hasProduct(q.product));
  if (q.delivery) {
    const list = await steps();
    const final = list[list.length - 1];
    const exp = Prisma.sql`NULLIF("details"->>'expectedDelivery', '')`;
    const today = todayShop();
    const open = Prisma.sql`${NOT_CANCELLED} AND "status" <> ${final}`;
    const byDay = { nodate: Prisma.sql`${exp} IS NULL`, overdue: Prisma.sql`${exp} < ${today}`, today: Prisma.sql`${exp} = ${today}`, upcoming: Prisma.sql`${exp} > ${today}` };
    conds.push(q.delivery === "delivered" ? Prisma.sql`"status" = ${final}` : Prisma.sql`${open} AND ${byDay[q.delivery]}`);
  }
  const excludesCancelled = !q.status && (places.length > 0 || !!q.buyer || q.hour !== undefined || q.weekday !== undefined);
  if (excludesCancelled) conds.push(NOT_CANCELLED);
  return { where: Prisma.join(conds, " AND "), excludesCancelled };
}

/** Orders per status text (only statuses that have orders). */
async function countsByStatus(where: Prisma.OrderWhereInput) {
  const groups = await prismadb.order.groupBy({ by: ["status"], where, _count: { _all: true } });
  const counts: Record<OrderStatus, number> = {};
  for (const g of groups) counts[g.status] = (counts[g.status] ?? 0) + g._count._all;
  return counts;
}

// ---------------------------------------------------------------- shared bits

async function firstImages(productIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(productIds));
  if (ids.length === 0) return new Map();
  const images = await prismadb.image.findMany({
    where: { productId: { in: ids } },
    select: { productId: true, url: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const map = new Map<string, string>();
  for (const img of images) if (!map.has(img.productId)) map.set(img.productId, img.url);
  return map;
}

/** One line. onRequest: the product had no price at checkout (a quote); its price is the seller's (0 until the quote is sent). */
export type OrderItemView = { productId: string; name: string; pricePaise: number; quantity: number; lineTotalPaise: number; imageUrl: string | null; onRequest: boolean };

/** A quote's state and dates (null for an order that never was one). */
export type QuoteView = { state: QuoteState; sentAt: string | null; decidedAt: string | null } | null;
const quoteView = (d: OrderDetails | null): QuoteView => (d?.quote ? { state: d.quote.state, sentAt: d.quote.sentAt, decidedAt: d.quote.decidedAt } : null);

const itemViews = (details: OrderDetails | null, images: Map<string, string>): OrderItemView[] =>
  (details?.items ?? []).map((i) => ({
    productId: i.productId,
    name: i.name,
    pricePaise: i.pricePaise,
    quantity: i.quantity,
    lineTotalPaise: i.pricePaise * i.quantity,
    imageUrl: images.get(i.productId) ?? null,
    onRequest: i.onRequest === true,
  }));

const refWhere = (ref: OrderRef): Prisma.OrderWhereInput => ("id" in ref ? { id: ref.id } : { orderNumber: ref.orderNumber });

// ---------------------------------------------------------------- admin

export type AdminOrderSummary = {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payment: string;
  totalPaise: number;
  itemCount: number; // sum of quantities
  itemNames: string[];
  customer: { id: string; fname: string; email: string; phone: string } | null;
  shipTo: { name: string; phone: string; city: string; state: string; pincode: string } | null;
  expectedDelivery: string | null; // YYYY-MM-DD
  returnStatus: string | null; // the return of this order, if any
  deliveredAt: string | null; // when it first reached the final step (ISO), if it is there now
};

export type AdminOrderList = {
  orders: AdminOrderSummary[];
  page: number;
  pageSize: number;
  totalCount: number; // matching the filters
  steps: OrderStatus[]; // the store's status list (first = start, last = final)
  statuses: OrderStatus[]; // for the filter: the list, Cancelled, then old statuses that orders still use
  counts: Record<OrderStatus, number>; // per status, with the same filters except status
  excludesCancelled: boolean; // the filters leave cancelled orders out (see filterIds)
};

const adminSelect = {
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  paymentStatus: true,
  payment: true,
  total: true,
  details: true,
  addressId: true,
  users: { select: { id: true, fname: true, email: true, phone: true } },
} satisfies Prisma.OrderSelect;

type AdminRow = Prisma.OrderGetPayload<{ select: typeof adminSelect }>;

function adminSummary(o: AdminRow, finalStatus?: string): AdminOrderSummary {
  const d = parseDetailsOrNull(o.id, o.details);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    paymentStatus: normalizePaymentStatus(o.paymentStatus),
    payment: o.payment,
    totalPaise: toPaise(o.total),
    itemCount: (d?.items ?? []).reduce((n, i) => n + i.quantity, 0),
    itemNames: (d?.items ?? []).map((i) => i.name),
    customer: o.users ? { ...o.users } : null,
    shipTo: d ? { name: d.shipTo.name, phone: d.shipTo.phone, city: d.shipTo.city, state: d.shipTo.state, pincode: d.shipTo.pincode } : null,
    expectedDelivery: d?.expectedDelivery ?? null,
    returnStatus: d?.return?.status ?? null,
    deliveredAt: d && finalStatus && o.status === finalStatus ? (reachedStatusAt(d, finalStatus)?.toISOString() ?? null) : null,
  };
}

export async function listAdminOrders(storeId: string, q: OrderListQuery): Promise<AdminOrderList> {
  // The status list is read alongside the filters (only the Delivery filter needs it first).
  const statuses = getOrderSettings(storeId).then((s) => (s ?? parseOrderSettings(null)).statuses);
  const [list, { where, excludesCancelled }] = await Promise.all([statuses, orderListWhere(storeId, q, () => statuses)]);
  const listed = q.status ? Prisma.sql`${where} AND "status" = ${q.status}` : where;
  const [page, total, byStatus] = await Promise.all([
    prismadb.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Order" WHERE ${listed}
      ORDER BY "createdAt" DESC, "orderNumber" DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    prismadb.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Order" WHERE ${listed}`,
    // Per status with the same filters but the status: the counts in the Status filter.
    prismadb.$queryRaw<{ status: string; n: number }[]>`SELECT "status", count(*)::int AS n FROM "Order" WHERE ${where} GROUP BY 1`,
  ]);
  // The page's rows (at most pageSize), in the page's order.
  const found = await prismadb.order.findMany({ where: { id: { in: page.map((r) => r.id) } }, select: adminSelect });
  const byId = new Map(found.map((o) => [o.id, o]));
  const rows = page.flatMap((r) => byId.get(r.id) ?? []);
  const counts: Record<OrderStatus, number> = Object.fromEntries(byStatus.map((g) => [g.status, g.n]));
  const totalCount = total[0]?.n ?? 0;
  const final = list[list.length - 1];
  return {
    orders: rows.map((o) => adminSummary(o, final)),
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    steps: list,
    statuses: statusOptions(list, Object.keys(counts)),
    counts,
    excludesCancelled,
  };
}

export type AdminOrder = Omit<AdminOrderSummary, "itemNames" | "returnStatus" | "deliveredAt"> & {
  updatedAt: string;
  addressId: string;
  money: OrderMoney;
  items: OrderItemView[];
  charges: OrderCharge[]; // a quote's extra lines (GST, shipping, discount): signed paise
  quote: QuoteView;
  canEditQuote: boolean; // the quote is open: the seller may (re)send its prices
  shipTo: ShipTo;
  expectedDelivery: string | null;
  privateNote: string | null; // ADMIN ONLY
  customerNote: string | null;
  adminContent: string | null;
  events: OrderEvent[]; // ALL events, private ones included, oldest first
  /** The store's status list (the stepper). */
  statuses: OrderStatus[];
  /** False when the status text is not in the list any more (renamed or removed): the admin replaces it. */
  statusKnown: boolean;
  /** Why the status cannot be moved at all: "FINAL" = the order is complete, "RETURN" = a return exists. Null = movable. */
  statusLock: StatusLock | null;
  nextStatus: OrderStatus | null; // one step forward (null when locked)
  prevStatus: OrderStatus | null; // one step back (null when locked)
  canCancel: boolean; // the admin can cancel (not from the final stage, not with a return, not twice)
  canRestoreStock: boolean; // cancelled, and its items were never put back into stock
  stockRestored: boolean; // cancelled, and the items were put back into stock
  returnsEnabled: boolean;
  returnStatuses: OrderStatus[]; // the store's return list
  return: AdminReturn | null;
};

export type AdminReturn = {
  status: string;
  reason: string;
  note: string | null;
  requestedAt: string;
  restocked: boolean; // display marker: the return put the items back into stock
  canRestock: boolean; // the order's stock is still taken (the shared flag), so "Put items back into stock" may be used
  statusKnown: boolean; // false: the status text is not in the return list any more
  nextStatus: string | null;
  prevStatus: string | null;
  canReject: boolean; // before the last step, not already rejected
  rejected: boolean;
};

export async function getAdminOrder(storeId: string, ref: OrderRef): Promise<AdminOrder | null> {
  const [o, settings] = await Promise.all([prismadb.order.findFirst({ where: { storeId, ...refWhere(ref) }, select: adminSelect }), getOrderSettings(storeId)]);
  if (!o) return null;
  const { statuses, returns } = settings ?? parseOrderSettings(null);
  const d = parseDetails(o.id, o.details);
  const images = await firstImages(d.items.map((i) => i.productId));
  const s = adminSummary(o);
  const lock = isCancelled(s.status) ? null : statusLock(statuses, s.status, d.return !== null);
  return {
    id: s.id,
    orderNumber: s.orderNumber,
    createdAt: s.createdAt,
    updatedAt: o.updatedAt.toISOString(),
    status: s.status,
    paymentStatus: s.paymentStatus,
    payment: s.payment,
    totalPaise: s.totalPaise,
    itemCount: s.itemCount,
    customer: s.customer,
    addressId: o.addressId,
    money: d.money,
    items: itemViews(d, images),
    charges: d.charges,
    quote: quoteView(d),
    canEditQuote: isQuote(s.status) && (d.quote?.state === "requested" || d.quote?.state === "sent"),
    shipTo: d.shipTo,
    expectedDelivery: d.expectedDelivery,
    privateNote: d.privateNote,
    customerNote: d.customerNote,
    adminContent: d.adminContent,
    events: d.events,
    statuses,
    statusKnown: statuses.includes(s.status),
    statusLock: lock,
    nextStatus: lock ? null : nextStatus(statuses, s.status),
    prevStatus: lock ? null : prevStatus(statuses, s.status),
    canCancel: (!lock || lock === "QUOTE") && !isCancelled(s.status), // an open quote may be cancelled
    canRestoreStock: isCancelled(s.status) && d.stockReserved === true,
    stockRestored: isCancelled(s.status) && d.stockReserved === false,
    returnsEnabled: returns.enabled,
    returnStatuses: returns.statuses,
    return: d.return
      ? {
          status: d.return.status,
          reason: d.return.reason,
          note: d.return.note,
          requestedAt: d.return.requestedAt,
          restocked: d.return.restocked,
          canRestock: !d.return.restocked && d.stockReserved === true,
          statusKnown: returns.statuses.includes(d.return.status),
          nextStatus: nextStatus(returns.statuses, d.return.status),
          prevStatus: prevStatus(returns.statuses, d.return.status),
          canReject: !isRejected(d.return.status) && !isFinalStatus(returns.statuses, d.return.status),
          rejected: isRejected(d.return.status),
        }
      : null,
  };
}

export type OrderStats = {
  steps: OrderStatus[]; // the store's status list
  statuses: OrderStatus[]; // the bars: the list, Cancelled, then old statuses that orders still use
  newOrders: number; // at the first status
  newStatus: OrderStatus; // the first status
  inProgress: number; // between the first and the final status
  codToCollect: { count: number; amountPaise: number }; // COD, payment PENDING, not cancelled
  revenuePaise: number; // paymentStatus PAID, not cancelled
  paidOrders: number; // same set as revenue
  byStatus: Record<OrderStatus, number>; // per status text (missing = 0)
  returned: number; // orders that have a return, any return status (a return is not an order status)
  byPaymentStatus: Record<PaymentStatus, number>;
  revenueByMonth: MonthRevenue[]; // the last 12 months, this one last (India time)
  quotes: { toPrice: number; open: number }; // quotes waiting for the seller's prices; all open quotes (priced or not)
};

/** Paid revenue of one month (India time). from / to = its first and last day, the Orders page filter for it. */
export type MonthRevenue = { month: string; label: string; revenuePaise: number; orders: number; from: string; to: string };

const notCancelled: Prisma.OrderWhereInput = { status: { not: CANCELLED } };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Paid revenue per month of the given year, India time. The database groups the rows (one row per month comes
 * back, not every order). "createdAt" is a UTC timestamp without time zone, so it is first read as UTC and then
 * moved to Asia/Kolkata before the month is cut. The year bounds are passed as explicit UTC instants so the
 * database session time zone cannot shift them.
 */
export async function revenueByMonth(storeId: string, year = new Date(Date.now() + SHOP_UTC_OFFSET_MS).getUTCFullYear()) {
  const from = new Date(`${year}-01-01T00:00:00+05:30`);
  const to = new Date(`${year + 1}-01-01T00:00:00+05:30`);
  const rows = await prismadb.$queryRaw<{ month: Date; paise: bigint }[]>`
    SELECT date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS month,
           (SUM("total") * 100)::bigint AS paise
    FROM "Order"
    WHERE "storeId" = ${storeId}
      AND "paymentStatus" = 'PAID'
      AND "status" <> ${CANCELLED}
      AND "createdAt" >= (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND "createdAt" < (${to.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1`;
  const sums = MONTHS.map(() => 0);
  // month is the IST wall-clock month start (a timestamp without zone); Prisma hands it back as that same wall time in UTC.
  for (const r of rows) sums[r.month.getUTCMonth()] += Number(r.paise);
  return MONTHS.map((month, i) => ({ month, revenuePaise: sums[i] }));
}

/**
 * Paid revenue per month for the last 12 months (this month and the 11 before it), India time, cancelled orders left
 * out: one row per month comes back from the database. Months with no sales are 0, so the chart always has 12 bars.
 */
export async function revenueLast12Months(storeId: string): Promise<MonthRevenue[]> {
  const [y, m] = todayShop().split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 12 + i, 1));
    const key = d.toISOString().slice(0, 7); // YYYY-MM
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return { month: key, label: MONTHS[d.getUTCMonth()], from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
  });
  const rows = await prismadb.$queryRaw<{ month: string; paise: bigint; orders: number }[]>`
    SELECT to_char(date_trunc('month', ${PLACED_SHOP_TIME}), 'YYYY-MM') AS month, (SUM("total") * 100)::bigint AS paise, count(*)::int AS orders
    FROM "Order"
    WHERE "storeId" = ${storeId} AND "paymentStatus" = 'PAID' AND ${NOT_CANCELLED}
      AND "createdAt" >= (${shopDayStart(months[0].from).toISOString()}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1`;
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((mo) => ({ ...mo, revenuePaise: Number(byMonth.get(mo.month)?.paise ?? 0), orders: byMonth.get(mo.month)?.orders ?? 0 }));
}

export async function getOrderStats(storeId: string): Promise<OrderStats> {
  const paid: Prisma.OrderWhereInput = { storeId, paymentStatus: "PAID", ...notCancelled };
  const cod: Prisma.OrderWhereInput = { storeId, payment: "COD", paymentStatus: "PENDING", ...notCancelled };
  const [settings, byStatus, payGroups, revenue, codAgg, months, returnedRows, quoteRows] = await Promise.all([
    getOrderSettings(storeId),
    countsByStatus({ storeId }),
    prismadb.order.groupBy({ by: ["paymentStatus"], where: { storeId }, _count: { _all: true } }),
    prismadb.order.aggregate({ where: paid, _sum: { total: true }, _count: { _all: true } }),
    prismadb.order.aggregate({ where: cod, _sum: { total: true }, _count: { _all: true } }),
    revenueLast12Months(storeId),
    prismadb.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Order" WHERE "storeId" = ${storeId} AND ${HAS_RETURN}`,
    prismadb.$queryRaw<{ toPrice: number }[]>`
      SELECT count(*) FILTER (WHERE "details"->'quote'->>'state' = 'requested')::int AS "toPrice"
      FROM "Order" WHERE "storeId" = ${storeId} AND "status" = ${QUOTE}`,
  ]);
  const byPaymentStatus = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<PaymentStatus, number>;
  for (const g of payGroups) byPaymentStatus[normalizePaymentStatus(g.paymentStatus)] += g._count._all;
  const { statuses } = settings ?? parseOrderSettings(null);
  return {
    steps: statuses,
    statuses: statusOptions(statuses, Object.keys(byStatus)),
    newStatus: statuses[0],
    newOrders: byStatus[statuses[0]] ?? 0,
    inProgress: statuses.slice(1, -1).reduce((n, s) => n + (byStatus[s] ?? 0), 0),
    codToCollect: { count: codAgg._count._all, amountPaise: toPaise(codAgg._sum.total ?? "0") },
    revenuePaise: toPaise(revenue._sum.total ?? "0"),
    paidOrders: revenue._count._all,
    byStatus,
    returned: returnedRows[0]?.n ?? 0,
    byPaymentStatus,
    revenueByMonth: months,
    quotes: { toPrice: quoteRows[0]?.toPrice ?? 0, open: byStatus[QUOTE] ?? 0 },
  };
}

// ---------------------------------------------------------------- customer (allow-list views)

export type CustomerOrderSummary = {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payment: string;
  totalPaise: number;
  items: OrderItemView[];
  canCancel: boolean; // cancellation is on and the status is one of the ticked ones; or an open quote (always withdrawable)
  quote: QuoteView;
  expectedDelivery: string | null; // YYYY-MM-DD
  returnStatus: string | null;
  canReturn: boolean; // returns on, final stage, no return yet, window open
  returnUntil: string | null; // last moment to ask (ISO), while the order is at the final stage
};

export type CustomerOrder = CustomerOrderSummary & {
  updatedAt: string;
  money: OrderMoney;
  shipTo: ShipTo;
  customerNote: string | null;
  adminContent: string | null; // Markdown from the seller
  charges: OrderCharge[]; // a quote's extra lines: shown under the items
  canDecideQuote: boolean; // the seller sent the prices: the customer may accept or decline
  return: { status: string; reason: string; note: string | null; requestedAt: string; canWithdraw: boolean; rejected: boolean } | null;
  events: CustomerOrderEvent[]; // only customer-visible events, oldest first, no meta
};

const customerSelect = {
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  paymentStatus: true,
  payment: true,
  total: true,
  details: true,
} satisfies Prisma.OrderSelect;
type CustomerRow = Prisma.OrderGetPayload<{ select: typeof customerSelect }>;

/** Whether the customer may ask for a return now, and until when (while the order sits at its final stage). */
function returnWindow(settings: OrderSettings, status: string, d: OrderDetails | null): { canReturn: boolean; returnUntil: string | null } {
  if (!d || !settings.returns.enabled || !isFinalStatus(settings.statuses, status)) return { canReturn: false, returnUntil: null };
  const since = reachedStatusAt(d, status);
  if (!since) return { canReturn: false, returnUntil: null };
  const until = new Date(since.getTime() + settings.returns.windowDays * 24 * 60 * 60 * 1000);
  return { canReturn: !d.return && Date.now() <= until.getTime(), returnUntil: until.toISOString() };
}

function customerSummary(o: CustomerRow, d: OrderDetails | null, images: Map<string, string>, settings: OrderSettings): CustomerOrderSummary {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    paymentStatus: normalizePaymentStatus(o.paymentStatus),
    payment: o.payment,
    totalPaise: toPaise(o.total),
    items: itemViews(d, images),
    canCancel: isQuote(o.status) || (settings.cancellation.enabled && settings.cancellation.allowedAt.includes(o.status)),
    quote: quoteView(d),
    expectedDelivery: d?.expectedDelivery ?? null,
    returnStatus: d?.return?.status ?? null,
    ...returnWindow(settings, o.status, d),
  };
}

export async function listCustomerOrders(storeId: string, customerId: string, q: OrderListQuery) {
  const where: Prisma.OrderWhereInput = { storeId, usersId: customerId };
  if (q.status) where.status = q.status;
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
  const [settings, rows, totalCount] = await Promise.all([
    getOrderSettings(storeId),
    prismadb.order.findMany({
      where,
      select: customerSelect,
      orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prismadb.order.count({ where }),
  ]);
  const parsed = rows.map((o) => ({ o, d: parseDetailsOrNull(o.id, o.details) }));
  const images = await firstImages(parsed.flatMap(({ d }) => (d?.items ?? []).map((i) => i.productId)));
  return {
    orders: parsed.map(({ o, d }) => customerSummary(o, d, images, settings ?? parseOrderSettings(null))),
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
  };
}

export async function getCustomerOrder(storeId: string, customerId: string, ref: OrderRef): Promise<CustomerOrder | null> {
  const [o, settings] = await Promise.all([
    prismadb.order.findFirst({ where: { storeId, usersId: customerId, ...refWhere(ref) }, select: customerSelect }),
    getOrderSettings(storeId),
  ]);
  if (!o) return null;
  const d = parseDetails(o.id, o.details);
  const images = await firstImages(d.items.map((i) => i.productId));
  const s = customerSummary(o, d, images, settings ?? parseOrderSettings(null));
  return {
    ...s,
    updatedAt: o.updatedAt.toISOString(),
    money: { subtotalPaise: d.money.subtotalPaise, shippingPaise: d.money.shippingPaise, totalPaise: d.money.totalPaise },
    shipTo: d.shipTo,
    customerNote: d.customerNote,
    adminContent: d.adminContent,
    charges: d.charges.map((c) => ({ label: c.label, amountPaise: c.amountPaise })),
    canDecideQuote: isQuote(o.status) && d.quote?.state === "sent",
    return: d.return
      ? {
          status: d.return.status,
          reason: d.return.reason,
          note: d.return.note,
          requestedAt: d.return.requestedAt,
          canWithdraw: mayWithdrawReturn((settings ?? parseOrderSettings(null)).returns.statuses, d.return, d.returnWithdrawals),
          rejected: isRejected(d.return.status),
        }
      : null,
    events: customerEvents(d.events),
  };
}

/**
 * What the Orders page column filters offer: the places orders were shipped to (counted without cancelled orders, as a
 * place filter lists them) and the products ordered (all orders).
 */
export type OrderFacets = {
  states: { value: string; orders: number }[];
  cities: { key: string; label: string; filter: { city: string; state: string }; orders: number }[]; // filter = the URL filters for that city
  pincodes: { value: string; orders: number }[];
  products: { id: string; name: string; orders: number }[];
};

const FACET_MAX = 300;

export async function getOrderFacets(storeId: string): Promise<OrderFacets> {
  const [places, products] = await Promise.all([
    prismadb.$queryRaw<{ state: string; city: string; pincode: string; orders: number }[]>`
      SELECT ${shipToPlace("state")} AS state, ${shipToPlace("city")} AS city, ${shipToPlace("pincode")} AS pincode, count(*)::int AS orders
      FROM "Order" WHERE "storeId" = ${storeId} AND ${NOT_CANCELLED}
      GROUP BY 1, 2, 3`,
    prismadb.$queryRaw<{ id: string; name: string; orders: number }[]>`
      SELECT i->>'productId' AS id, MAX(i->>'name') AS name, count(DISTINCT o."id")::int AS orders
      FROM "Order" o CROSS JOIN LATERAL jsonb_array_elements(o."details"->'items') i
      WHERE o."storeId" = ${storeId}
      GROUP BY 1 ORDER BY 3 DESC, 2 LIMIT ${FACET_MAX}`,
  ]);
  const sum = (key: (p: (typeof places)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of places) m.set(key(p), (m.get(key(p)) ?? 0) + p.orders);
    return m;
  };
  const byName = (a: { orders: number }, b: { orders: number }) => b.orders - a.orders;
  const list = (m: Map<string, number>) =>
    Array.from(m, ([value, orders]) => ({ value, orders }))
      .sort(byName)
      .slice(0, FACET_MAX);
  // A city is named with its state (the same name in two states is two places), except the unknown city, which is one.
  const cityFilter = (p: (typeof places)[number]) => (p.city === UNKNOWN_PLACE ? { city: UNKNOWN_PLACE, state: "" } : { city: p.city, state: p.state });
  const cityKey = (f: { city: string; state: string }) => (f.state ? `${f.city}, ${f.state}` : f.city);
  const filters = new Map(places.map((p) => [cityKey(cityFilter(p)), cityFilter(p)]));
  const cities = Array.from(
    sum((p) => cityKey(cityFilter(p))),
    ([key, orders]) => ({ key, label: key, filter: filters.get(key)!, orders }),
  );
  return { states: list(sum((p) => p.state)), cities: cities.sort(byName).slice(0, FACET_MAX), pincodes: list(sum((p) => p.pincode)), products };
}

/**
 * Names for the filter chips of ids that come from links (a customer, a product), so a chip says "Customer: Asha"
 * and not an id. Only this store's customer / product is named; anything else stays "".
 */
export async function filterLabels(storeId: string, ids: { buyer?: string; product?: string }) {
  const [buyer, product] = await Promise.all([
    ids.buyer ? prismadb.users.findFirst({ where: { id: ids.buyer, orders: { some: { storeId } } }, select: { fname: true, email: true } }) : null,
    ids.product ? prismadb.product.findFirst({ where: { id: ids.product, storeId }, select: { name: true } }) : null,
  ]);
  return { buyerName: buyer ? buyer.fname || buyer.email : "", productName: product?.name ?? "" };
}
