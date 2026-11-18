import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import {
  CustomerOrderEvent,
  OrderDetails,
  OrderEvent,
  OrderMoney,
  ShipTo,
  customerEvents,
  parseDetails,
  parseDetailsOrNull,
} from "./details";
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
  isFinalStatus,
  isRejected,
  nextStatus,
  normalizePaymentStatus,
  prevStatus,
  statusOptions,
} from "./status";
import { OrderRef, reachedFinalAt } from "./update";

/** Read side. Admin views include everything; customer views are built field by field (allow-list). */

// ---------------------------------------------------------------- filters

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date as YYYY-MM-DD");

export const orderListQuerySchema = z.object({
  status: z.string().trim().max(STATUS_LABEL_MAX).optional(), // the status text
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(), // search: order number, customer name / email / phone, receiver name / phone
  from: day.optional(), // first day included, India time
  to: day.optional(), // last day included, India time
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

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

/** India has no daylight saving: a day starts at 00:00 +05:30. */
const istDayStart = (d: string) => new Date(`${d}T00:00:00.000+05:30`);
const nextIstDayStart = (d: string) => new Date(istDayStart(d).getTime() + 24 * 60 * 60 * 1000);

const has = (t: string) => ({ contains: t, mode: "insensitive" as const });
const inShipTo = (field: string, t: string): Prisma.OrderWhereInput => ({ details: { path: ["shipTo", field], string_contains: t, mode: "insensitive" } });

/** The search box: "#1042" is that order number only; anything else is text found in the customer or the receiver (a plain number also matches the order number). */
function searchWhere(text: string): Prisma.OrderWhereInput {
  const t = text.replace(/^#/, "").trim();
  if (text.startsWith("#")) return /^\d{1,9}$/.test(t) ? { orderNumber: Number(t) } : { id: "" };
  const or: Prisma.OrderWhereInput[] = [
    { users: { is: { fname: has(t) } } },
    { users: { is: { email: has(t) } } },
    { users: { is: { phone: has(t) } } },
    inShipTo("name", t),
    inShipTo("phone", t),
  ];
  if (/^\d{1,9}$/.test(t)) or.push({ orderNumber: Number(t) });
  return { OR: or };
}

function baseWhere(storeId: string, q: Pick<OrderListQuery, "paymentStatus" | "from" | "to" | "q">): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { storeId };
  if (q.q) Object.assign(where, searchWhere(q.q));
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = istDayStart(q.from);
    if (q.to) where.createdAt.lt = nextIstDayStart(q.to);
  }
  return where;
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

export type OrderItemView = { productId: string; name: string; pricePaise: number; quantity: number; lineTotalPaise: number; imageUrl: string | null };

const itemViews = (details: OrderDetails | null, images: Map<string, string>): OrderItemView[] =>
  (details?.items ?? []).map((i) => ({
    productId: i.productId,
    name: i.name,
    pricePaise: i.pricePaise,
    quantity: i.quantity,
    lineTotalPaise: i.pricePaise * i.quantity,
    imageUrl: images.get(i.productId) ?? null,
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
  shipTo: { name: string; phone: string; pincode: string } | null;
  expectedDelivery: string | null; // YYYY-MM-DD
  returnStatus: string | null; // the return of this order, if any
};

export type AdminOrderList = {
  orders: AdminOrderSummary[];
  page: number;
  pageSize: number;
  totalCount: number; // matching the filters
  steps: OrderStatus[]; // the store's status list (first = start, last = final)
  statuses: OrderStatus[]; // for the filter: the list, Cancelled, then old statuses that orders still use
  counts: Record<OrderStatus, number>; // per status, with the same filters except status
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

function adminSummary(o: AdminRow): AdminOrderSummary {
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
    shipTo: d ? { name: d.shipTo.name, phone: d.shipTo.phone, pincode: d.shipTo.pincode } : null,
    expectedDelivery: d?.expectedDelivery ?? null,
    returnStatus: d?.return?.status ?? null,
  };
}

export async function listAdminOrders(storeId: string, q: OrderListQuery): Promise<AdminOrderList> {
  const base = baseWhere(storeId, q);
  const where: Prisma.OrderWhereInput = q.status ? { ...base, status: q.status } : base;
  const [settings, rows, totalCount, counts] = await Promise.all([
    getOrderSettings(storeId),
    prismadb.order.findMany({
      where,
      select: adminSelect,
      orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prismadb.order.count({ where }),
    countsByStatus(base),
  ]);
  const list = (settings ?? parseOrderSettings(null)).statuses;
  return { orders: rows.map(adminSummary), page: q.page, pageSize: q.pageSize, totalCount, steps: list, statuses: statusOptions(list, Object.keys(counts)), counts };
}

export type AdminOrder = Omit<AdminOrderSummary, "itemNames" | "returnStatus"> & {
  updatedAt: string;
  addressId: string;
  money: OrderMoney;
  items: OrderItemView[];
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
  const [o, settings] = await Promise.all([
    prismadb.order.findFirst({ where: { storeId, ...refWhere(ref) }, select: adminSelect }),
    getOrderSettings(storeId),
  ]);
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
    canCancel: !lock && !isCancelled(s.status),
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
  byPaymentStatus: Record<PaymentStatus, number>;
  revenueByMonth: { month: string; revenuePaise: number }[]; // this year (India time), "Jan".."Dec"
};

const notCancelled: Prisma.OrderWhereInput = { status: { not: CANCELLED } };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 330 * 60 * 1000;

/**
 * Paid revenue per month of the given year, India time. The database groups the rows (one row per month comes
 * back, not every order). "createdAt" is a UTC timestamp without time zone, so it is first read as UTC and then
 * moved to Asia/Kolkata before the month is cut. The year bounds are passed as explicit UTC instants so the
 * database session time zone cannot shift them.
 */
export async function revenueByMonth(storeId: string, year = new Date(Date.now() + IST_MS).getUTCFullYear()) {
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

export async function getOrderStats(storeId: string): Promise<OrderStats> {
  const paid: Prisma.OrderWhereInput = { storeId, paymentStatus: "PAID", ...notCancelled };
  const cod: Prisma.OrderWhereInput = { storeId, payment: "COD", paymentStatus: "PENDING", ...notCancelled };
  const [settings, byStatus, payGroups, revenue, codAgg, months] = await Promise.all([
    getOrderSettings(storeId),
    countsByStatus({ storeId }),
    prismadb.order.groupBy({ by: ["paymentStatus"], where: { storeId }, _count: { _all: true } }),
    prismadb.order.aggregate({ where: paid, _sum: { total: true }, _count: { _all: true } }),
    prismadb.order.aggregate({ where: cod, _sum: { total: true }, _count: { _all: true } }),
    revenueByMonth(storeId),
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
    byPaymentStatus,
    revenueByMonth: months,
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
  canCancel: boolean; // cancellation is on and the status is one of the ticked ones
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
  const since = reachedFinalAt(d, status);
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
    canCancel: settings.cancellation.enabled && settings.cancellation.allowedAt.includes(o.status),
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
    shipTo: { name: d.shipTo.name, phone: d.shipTo.phone, address: d.shipTo.address, pincode: d.shipTo.pincode, instructions: d.shipTo.instructions },
    customerNote: d.customerNote,
    adminContent: d.adminContent,
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
