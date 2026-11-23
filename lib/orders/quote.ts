import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { MAX_PAISE, formatINR, paiseToDecimalString, sumPaise, lineTotalPaise } from "@/lib/money";
import { takeStock } from "./create";
import { CHARGES_MAX, orderChargeSchema, orderTotalPaise, parseDetails } from "./details";
import { OrderError } from "./errors";
import { notifyOrder } from "./notify";
import { getOrderSettingsTx } from "./settings";
import { CANCELLED, COD, isQuote } from "./status";
import { OrderRef, TX_OPTIONS, lockOrder, newEvent, saveOrder } from "./update";

/**
 * Quotes: an order with a price-on-request product waits at the reserved status "Quote" (lib/orders/create.ts).
 *   1. The seller fills in the prices (any line) and extra charges (GST, shipping, a discount) and sends them.
 *      Until the customer answers, the seller may change them and send again. There are no drafts: what is saved is
 *      what the customer sees (so a half-typed price never shows up on their page).
 *   2. The customer accepts: the stock is taken now (same guarded statement as a checkout), the order moves to the
 *      first status of the list, and the prices are final. Or declines: the order is cancelled (no stock to give back).
 * Every step runs under the order row lock, like every other order change (lib/orders/update.ts).
 */

const OPEN_FOR_PRICES = ["requested", "sent"] as const;

export const adminQuoteSchema = z
  .object({
    // The unit price of each line, by product. Lines not listed keep their price.
    prices: z
      .array(z.object({ productId: z.string().trim().min(1).max(100), pricePaise: z.number().int().min(0).max(MAX_PAISE) }).strict())
      .max(50),
    charges: z.array(orderChargeSchema).max(CHARGES_MAX),
  })
  .strict();
export type AdminQuoteInput = z.infer<typeof adminQuoteSchema>;

/** The seller sends (or sends again) the prices of a quote. Throws OrderError. */
export async function adminSaveQuote(storeId: string, ref: OrderRef, adminUserId: string, input: AdminQuoteInput) {
  const result = await prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const details = parseDetails(order.id, order.details);
    const q = details.quote;
    if (!q || !isQuote(order.status) || !(OPEN_FOR_PRICES as readonly string[]).includes(q.state)) {
      throw new OrderError("QUOTE_NOT_OPEN", "This quote was already answered, so its prices can't change.");
    }

    const byProduct = new Map(input.prices.map((p) => [p.productId, p.pricePaise]));
    for (const id of Array.from(byProduct.keys())) {
      if (!details.items.some((i) => i.productId === id)) throw new OrderError("VALIDATION", "A price is for a product that is not in this order");
    }
    details.items = details.items.map((i) => (byProduct.has(i.productId) ? { ...i, pricePaise: byProduct.get(i.productId)! } : i));
    details.charges = input.charges;

    const unpriced = details.items.find((i) => i.onRequest && i.pricePaise <= 0);
    if (unpriced) throw new OrderError("VALIDATION", `Add a price for ${unpriced.name}`);
    const subtotalPaise = sumPaise(details.items.map((i) => lineTotalPaise(i.pricePaise, i.quantity)));
    const totalPaise = orderTotalPaise(details.items, details.charges, details.money.shippingPaise);
    details.money = { ...details.money, subtotalPaise, totalPaise };

    const again = q.state === "sent";
    details.quote = { ...q, state: "sent", sentAt: new Date().toISOString() };
    details.events.push(
      newEvent({ type: "quote", message: `${again ? "Quote updated" : "Quote sent"}: ${formatINR(totalPaise)}`, actor: "admin", customerVisible: true, meta: { adminUserId } }),
    );
    // The total column is what revenue and the lists read: written in the same save as the prices.
    await saveOrder(tx, order.id, details, { total: paiseToDecimalString(totalPaise) });
    return { id: order.id };
  }, TX_OPTIONS);
  notifyOrder(storeId, result.id, "quote-sent");
  return result;
}

export const customerQuoteSchema = z
  .object({
    accept: z.boolean(),
    reason: z.string().trim().max(500).optional(), // why not (decline only, optional)
  })
  .strict();
export type CustomerQuoteInput = z.infer<typeof customerQuoteSchema>;

/** The customer accepts or declines the prices of their quote. Throws OrderError (OUT_OF_STOCK when it sold out meanwhile). */
export async function customerDecideQuote(storeId: string, customerId: string, ref: OrderRef, input: CustomerQuoteInput) {
  const result = await prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref, customerId);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const details = parseDetails(order.id, order.details);
    const q = details.quote;
    if (!q || !isQuote(order.status) || q.state !== "sent") {
      throw new OrderError("QUOTE_NOT_OPEN", q?.state === "requested" ? "The store has not sent the prices yet." : "This quote was already answered.");
    }
    const now = new Date().toISOString();

    if (!input.accept) {
      const why = input.reason?.trim();
      details.quote = { ...q, state: "declined", decidedAt: now };
      details.events.push(newEvent({ type: "status", status: CANCELLED, message: why ? `Quote declined: ${why}` : "Quote declined", actor: "customer", customerVisible: true }));
      await saveOrder(tx, order.id, details, { status: CANCELLED });
      return { id: order.id, accepted: false };
    }

    // Accepted: the stock is taken now (refused, and nothing changes, when there is not enough any more).
    await takeStock(tx, storeId, details.items);
    const settings = await getOrderSettingsTx(tx, storeId);
    const first = settings.statuses[0];
    details.quote = { ...q, state: "accepted", decidedAt: now };
    details.stockReserved = true;
    details.events.push(
      newEvent({ type: "quote", message: `Quote accepted: ${formatINR(details.money.totalPaise)}`, actor: "customer", customerVisible: true }),
      newEvent({ type: "status", status: first, message: "Order placed", actor: "customer", customerVisible: true }),
    );
    await saveOrder(tx, order.id, details, { status: first, payment: settings.checkoutPaymentStep ? COD : "" });
    return { id: order.id, accepted: true };
  }, TX_OPTIONS);
  if (result.accepted) revalidateStoreCatalog(storeId); // stock was taken
  notifyOrder(storeId, result.id, result.accepted ? "quote-accepted" : "quote-declined");
  return result;
}
