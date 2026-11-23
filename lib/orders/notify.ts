import { after } from "next/server";

import prismadb from "@/lib/prismadb";
import { formatINR, toPaise } from "@/lib/money";
import { pushConfigured, sendPush } from "@/lib/push";
import { storeUrl } from "@/lib/store-url";

/**
 * Order notifications: web push to the store owner (admin app) or to the shopper (store app), after the order change
 * is committed. Sent after the response (next/server after), so it never slows an order down, and never throws.
 * Email comes later: OneSignal email needs a domain of our own (settings.orders.autoEmails stays off until then).
 *
 *   to the owner:    placed, quote-requested, quote-accepted, quote-declined, customer-cancelled, return-requested
 *   to the shopper:  status (the order moved; `detail` = the new status), store-cancelled, quote-sent,
 *                    return-status (`detail` = the return's new status)
 */
export type OrderNotice =
  | "placed"
  | "quote-requested"
  | "quote-accepted"
  | "quote-declined"
  | "customer-cancelled"
  | "return-requested"
  | "status"
  | "store-cancelled"
  | "quote-sent"
  | "return-status";

const FOR_OWNER = new Set<OrderNotice>(["placed", "quote-requested", "quote-accepted", "quote-declined", "customer-cancelled", "return-requested"]);

/** Where an owner's push opens: this admin app. NEXT_PUBLIC_ADMIN_URL, else Vercel's production address, else local. */
function adminOrigin() {
  const set = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
  if (set) return set.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

type Facts = { store: string; n: number; total: string; customer: string; detail?: string };

const OWNER_TEXT: Partial<Record<OrderNotice, (f: Facts) => [string, string]>> = {
  placed: (f) => [`New order #${f.n}`, `${f.total} from ${f.customer}`],
  "quote-requested": (f) => [`New quote request #${f.n}`, `From ${f.customer}. Add the prices and send them.`],
  "quote-accepted": (f) => [`Quote accepted #${f.n}`, `${f.customer} accepted ${f.total}. The order is placed.`],
  "quote-declined": (f) => [`Quote declined #${f.n}`, `${f.customer} declined the quote.`],
  "customer-cancelled": (f) => [`Order #${f.n} cancelled`, `${f.customer} cancelled the order.`],
  "return-requested": (f) => [`Return requested #${f.n}`, `${f.customer} asked to return the order.`],
};
const SHOPPER_TEXT: Partial<Record<OrderNotice, (f: Facts) => [string, string]>> = {
  status: (f) => [`Order #${f.n}: ${f.detail}`, `Your order from ${f.store} is now ${f.detail}.`],
  "store-cancelled": (f) => [`Order #${f.n} was cancelled`, `${f.store} cancelled your order. Open it for details.`],
  "quote-sent": (f) => [`Your quote #${f.n} is ready`, `${f.store}: total ${f.total}. Open it to accept or decline.`],
  "return-status": (f) => [`Return for order #${f.n}: ${f.detail}`, `${f.store} updated your return.`],
};

async function send(storeId: string, orderId: string, notice: OrderNotice, detail?: string) {
  const owner = FOR_OWNER.has(notice);
  const o = await prismadb.order.findFirst({
    where: { id: orderId, storeId },
    select: { orderNumber: true, usersId: true, total: true, users: { select: { fname: true } }, store: { select: { name: true, slug: true, userId: true } } },
  });
  if (!o) return;
  const facts: Facts = { store: o.store.name, n: o.orderNumber, total: formatINR(toPaise(o.total)), customer: o.users?.fname || "A customer", detail };
  const text = (owner ? OWNER_TEXT : SHOPPER_TEXT)[notice];
  if (!text) return;
  const [title, message] = text(facts);
  await sendPush(owner ? "admin" : "store", {
    to: [owner ? o.store.userId : o.usersId],
    title: owner ? `${o.store.name}: ${title}` : title, // an owner may run several stores: the store's name leads
    message,
    url: owner ? `${adminOrigin()}/${storeId}/orders/${o.orderNumber}` : `${storeUrl(o.store.slug)}/orders/${o.orderNumber}`,
    topic: `order-${orderId}`,
  });
}

/** Schedules the push for after the response. No query at all when that push app is not set up. */
export function notifyOrder(storeId: string, orderId: string, notice: OrderNotice, detail?: string): void {
  if (!pushConfigured(FOR_OWNER.has(notice) ? "admin" : "store")) return;
  const run = () => send(storeId, orderId, notice, detail).catch((error) => console.error("[ORDER_NOTIFY]", error));
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts)
  }
}
