import { revalidateProducts } from "@/lib/store-revalidate";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { MARKDOWN_MAX, OrderDetails, detailsToJson, OrderEvent, orderDetailsSchema, parseDetails, expectedDeliverySchema, PRIVATE_NOTE_MAX, reachedStatusAt } from "./details";
import { OrderError } from "./errors";
import { OrderSettings, getOrderSettingsTx } from "./settings";
import { notifyOrder, type OrderNotice } from "./notify";
import type { SoldOut } from "./create";
import {
  CANCELLED,
  PAYMENT_STATUSES,
  REJECTED,
  canMoveReturn,
  STATUS_LOCK_MESSAGES,
  isFinalStatus,
  mayWithdrawReturn,
  statusLock,
  isRejected,
  PAYMENT_STATUS_LABELS,
  STATUS_LABEL_MAX,
  canMovePayment,
  canMoveStatus,
  isCancelled,
  isQuote,
  normalizePaymentStatus,
} from "./status";

/**
 * Every change to an order after it was created goes through here:
 *   one transaction -> SELECT ... FOR UPDATE on the order row -> decide from THAT row -> write once.
 * So two writers (admin + customer, two admin tabs) never lose an event, and "cancel" (which gives the
 * stock back) can happen only once: Cancelled is final in the status machine.
 * Cancelling does NOT give the stock back (the parcel may still be on its way): the admin restores it with a button.
 */

// A checkout is 7 statements (scripts/profile-checkout.ts), an update 3-5: tens of milliseconds locally and a few seconds even
// at 300 ms per round trip. 10 s is far above that; if a transaction ever needs more, something is wrong and failing beats hanging.
export const TX_OPTIONS = { maxWait: 5000, timeout: 10000 } as const;

/** An order is addressed by its id (uuid) or by its per-store number ("1042"). */
export type OrderRef = { id: string } | { orderNumber: number };

export function parseOrderRef(raw: string): OrderRef {
  const t = raw.trim().replace(/^#/, "");
  if (/^\d{1,9}$/.test(t)) return { orderNumber: Number(t) };
  return { id: t };
}

type LockedOrder = {
  id: string;
  storeId: string;
  usersId: string;
  status: string;
  paymentStatus: string;
  payment: string;
  details: unknown;
};

/** Locks one order row of this store (and of this customer, when usersId is given). Null when not found. */
export async function lockOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  ref: OrderRef,
  usersId?: string,
): Promise<LockedOrder | null> {
  const byRef = "id" in ref ? Prisma.sql`id = ${ref.id}` : Prisma.sql`"orderNumber" = ${ref.orderNumber}`;
  const byUser = usersId === undefined ? Prisma.empty : Prisma.sql`AND "usersId" = ${usersId}`;
  const rows = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, "storeId", "usersId", status, "paymentStatus", payment, details
    FROM "Order"
    WHERE "storeId" = ${storeId} AND ${byRef} ${byUser}
    FOR UPDATE`;
  return rows[0] ?? null;
}

export function newEvent(e: Omit<OrderEvent, "id" | "at">): OrderEvent {
  return { id: randomUUID(), at: new Date().toISOString(), ...e };
}

/** Gives the order's stock back, once. Products are updated in id order (no deadlocks). Returns the products that were out of stock and are back in stock. */
async function restoreStock(tx: Prisma.TransactionClient, orderId: string, storeId: string): Promise<SoldOut[]> {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, orderQuantity: true } });
  const perProduct = new Map<string, number>();
  for (const i of items) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.orderQuantity);
  const backInStock: SoldOut[] = [];
  for (const productId of Array.from(perProduct.keys()).sort()) {
    const n = perProduct.get(productId)!;
    if (n <= 0) continue;
    // A deleted product or one with untracked stock (quantity IS NULL) is skipped (0 rows).
    const [row] = await tx.$queryRaw<{ quantity: number; categoryId: string }[]>`
      UPDATE "Product" SET quantity = quantity + ${n}, "updatedAt" = now()
      WHERE id = ${productId} AND "storeId" = ${storeId} AND quantity IS NOT NULL
      RETURNING quantity, "categoryId"`;
    if (row && row.quantity > 0 && row.quantity - n <= 0) backInStock.push({ id: productId, categoryId: row.categoryId }); // it was out of stock before
  }
  return backInStock;
}

/** Writes the new details (checked by the schema) and the changed columns. */
export async function saveOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  details: OrderDetails,
  data: Omit<Prisma.OrderUpdateInput, "details">,
) {
  const checked = orderDetailsSchema.parse(details);
  await tx.order.update({ where: { id: orderId }, data: { ...data, details: detailsToJson(checked) } });
}

const itemsWord = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
const stockNote = (details: OrderDetails) => `Stock restored: ${itemsWord(details.items.reduce((n, i) => n + i.quantity, 0))} returned to inventory`;

// ---------------------------------------------------------------- admin: the one status update action

const optionalText = (max: number) => z.string().trim().max(max);

export const adminOrderUpdateSchema = z
  .object({
    status: z.string().trim().min(1).max(STATUS_LABEL_MAX).optional(), // next / previous step, "Cancelled", or (old status) any current one
    returnStatus: z.string().trim().min(1).max(STATUS_LABEL_MAX).optional(), // the return: next / previous step, "Rejected", or (old status) any current one
    restock: z.boolean().optional(), // with returnStatus: put the items back into stock (once per return)
    restoreStock: z.boolean().optional(), // a cancelled order: put its items back into stock (once)
    payment: optionalText(50).optional(), // the method: "COD" or what was agreed, e.g. "UPI to 98xxxx"
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    expectedDelivery: expectedDeliverySchema.nullable().optional(), // YYYY-MM-DD; null clears it
    privateNote: z.string().max(PRIVATE_NOTE_MAX).nullable().optional(), // admin-only Notes; null clears
    comment: z.string().trim().min(1).max(5000).optional(),
    customerVisible: z.boolean().optional(), // for the comment; default false (private note)
    adminContent: z.string().max(MARKDOWN_MAX).nullable().optional(), // Markdown shown on the customer's order page; null clears
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== "customerVisible" && k !== "restock"), "Nothing to change");
export type AdminOrderUpdate = z.infer<typeof adminOrderUpdateSchema>;

/** The admin status update action. Returns the order id. Throws OrderError. */
export async function adminUpdateOrder(storeId: string, ref: OrderRef, adminUserId: string, input: AdminOrderUpdate) {
  const backInStock: SoldOut[] = []; // products that were out of stock and have stock again
  const notices: [OrderNotice, string?][] = []; // for the shopper, sent once the change is saved
  const result = await prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const details = parseDetails(order.id, order.details);
    const data: Prisma.OrderUpdateInput = {};
    const events: OrderEvent[] = [];
    const meta = { adminUserId };

    const from = order.status;
    let current = order.status; // the status after this update
    let settings: OrderSettings | null = null; // read once, only when a status or a return changes
    const loadSettings = async () => (settings ??= await getOrderSettingsTx(tx, storeId));
    if (input.status && input.status !== from) {
      const { statuses } = await loadSettings();
      // Frozen: complete orders (final stage) and orders with a return (any return state) cannot be moved any more.
      const lock = statusLock(statuses, from, details.return !== null);
      // A quote cannot be moved along (the customer's yes does that), but the seller may cancel it.
      if (lock && !(lock === "QUOTE" && isCancelled(input.status))) throw new OrderError("STATUS_LOCKED", STATUS_LOCK_MESSAGES[lock], { status: from, reason: lock });
      if (!canMoveStatus(statuses, from, input.status)) {
        throw new OrderError("INVALID_TRANSITION", `Cannot move an order from ${from} to ${input.status}`, { from, to: input.status });
      }
      current = isCancelled(input.status) ? CANCELLED : input.status;
      data.status = current;
      notices.push(isCancelled(current) ? ["store-cancelled"] : ["status", current]);
      events.push(newEvent({ type: "status", status: current, actor: "admin", customerVisible: true, meta: { ...meta, from } }));
    }

    if (input.restoreStock) {
      if (!isCancelled(current)) throw new OrderError("VALIDATION", "Stock can be restored only for a cancelled order");
      if (details.stockReserved) {
        backInStock.push(...(await restoreStock(tx, order.id, order.storeId)));
        details.stockReserved = false;
        events.push(newEvent({ type: "system", message: stockNote(details), actor: "system", customerVisible: false, meta }));
      }
    }

    if (input.returnStatus !== undefined || input.restock) {
      const ret = details.return;
      if (!ret) throw new OrderError("NO_RETURN", "This order has no return");
      const { returns } = await loadSettings();
      if (input.returnStatus !== undefined && input.returnStatus !== ret.status) {
        if (!canMoveReturn(returns.statuses, ret.status, input.returnStatus)) {
          throw new OrderError("INVALID_TRANSITION", `Cannot move a return from ${ret.status} to ${input.returnStatus}`, { from: ret.status, to: input.returnStatus });
        }
        const to = isRejected(input.returnStatus) ? REJECTED : input.returnStatus;
        events.push(newEvent({ type: "return", status: to, message: `Return: ${to}`, actor: "admin", customerVisible: true, meta: { ...meta, from: ret.status } }));
        notices.push(["return-status", to]);
        ret.status = to;
      }
      if (input.restock && !ret.restocked) {
        // One shared flag with "Restore stock" of a cancelled order: stock goes back only while stockReserved is true.
        if (details.stockReserved !== true) throw new OrderError("VALIDATION", "The stock of this order was already put back (or never taken)");
        backInStock.push(...(await restoreStock(tx, order.id, order.storeId)));
        details.stockReserved = false;
        ret.restocked = true;
        events.push(newEvent({ type: "system", message: `${stockNote(details)} (return)`, actor: "system", customerVisible: false, meta }));
      }
    }

    if (input.payment !== undefined && input.payment !== order.payment) {
      data.payment = input.payment;
      events.push(
        newEvent({
          type: "payment",
          message: input.payment ? `Payment method: ${input.payment}` : "Payment method cleared",
          actor: "admin",
          customerVisible: true,
          meta: { ...meta, from: order.payment, to: input.payment },
        }),
      );
    }

    const payFrom = normalizePaymentStatus(order.paymentStatus);
    if (input.paymentStatus && input.paymentStatus !== payFrom) {
      if (!canMovePayment(payFrom, input.paymentStatus)) {
        throw new OrderError(
          "INVALID_PAYMENT_TRANSITION",
          `Cannot change payment from ${PAYMENT_STATUS_LABELS[payFrom]} to ${PAYMENT_STATUS_LABELS[input.paymentStatus]}`,
          { from: payFrom, to: input.paymentStatus },
        );
      }
      data.paymentStatus = input.paymentStatus;
      const method = (input.payment ?? order.payment) || "not set";
      events.push(
        newEvent({
          type: "payment",
          message: `Payment ${PAYMENT_STATUS_LABELS[input.paymentStatus].toLowerCase()} (${method})`,
          actor: "admin",
          customerVisible: true,
          meta: { ...meta, from: payFrom, to: input.paymentStatus },
        }),
      );
    }

    if (input.expectedDelivery !== undefined && input.expectedDelivery !== details.expectedDelivery) {
      details.expectedDelivery = input.expectedDelivery;
      events.push(
        newEvent({
          type: "delivery",
          message: input.expectedDelivery ? `Expected delivery: ${input.expectedDelivery}` : "Expected delivery date removed",
          actor: "admin",
          customerVisible: true,
          meta,
        }),
      );
    }

    if (input.privateNote !== undefined) {
      const next = input.privateNote && input.privateNote.trim() ? input.privateNote : null;
      if (next !== details.privateNote) {
        details.privateNote = next;
        // The event never says what the note is, and is never customer-visible.
        events.push(newEvent({ type: "system", message: "Notes updated", actor: "admin", customerVisible: false, meta }));
      }
    }

    if (input.adminContent !== undefined && input.adminContent !== details.adminContent) {
      details.adminContent = input.adminContent && input.adminContent.trim() ? input.adminContent : null;
      events.push(newEvent({ type: "system", message: "Order page message updated", actor: "admin", customerVisible: false, meta }));
    }

    if (input.comment) {
      events.push(newEvent({ type: "comment", message: input.comment, actor: "admin", customerVisible: input.customerVisible ?? false, meta }));
    }

    if (events.length === 0 && Object.keys(data).length === 0) return { id: order.id, changed: false };
    details.events.push(...events);
    await saveOrder(tx, order.id, details, data);
    return { id: order.id, changed: true };
  }, TX_OPTIONS);
  revalidateProducts(storeId, backInStock, { listingChanged: true }); // back from 0: the cached "out of stock" must go; a bigger stock changes nothing cached
  if (result.changed) for (const [notice, detail] of notices) notifyOrder(storeId, result.id, notice, detail);
  return result;
}

// ---------------------------------------------------------------- customer: cancel my order

export const customerCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

/**
 * Cancels the customer's own order. Allowed only when the store turned cancellation on and the order is at one of the
 * statuses ticked in Settings (checked again here under the lock). Throws OrderError.
 */
export async function customerCancelOrder(storeId: string, customerId: string, ref: OrderRef, reason?: string) {
  const result = await prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref, customerId);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const { cancellation } = await getOrderSettingsTx(tx, storeId);
    // An open quote (no stock taken, nothing agreed) may always be withdrawn, whatever the cancellation settings say.
    const quote = isQuote(order.status);
    if (!quote && (!cancellation.enabled || !cancellation.allowedAt.includes(order.status))) {
      throw new OrderError("NOT_CANCELLABLE", "This order can no longer be cancelled here. Please contact the store.", { status: order.status });
    }
    const details = parseDetails(order.id, order.details);
    const why = reason?.trim() ?? "";
    if (cancellation.askReason && !quote) {
      if (!why) throw new OrderError("VALIDATION", "Please choose a reason");
    }
    if (quote && details.quote) details.quote = { ...details.quote, state: "declined", decidedAt: new Date().toISOString() };
    details.events.push(
      newEvent({
        type: "status",
        status: CANCELLED,
        message: quote ? (why ? `Quote withdrawn by customer: ${why}` : "Quote withdrawn by customer") : why ? `Cancelled by customer: ${why}` : "Cancelled by customer",
        actor: "customer",
        customerVisible: true,
      }),
    );
    await saveOrder(tx, order.id, details, { status: CANCELLED });
    return { id: order.id };
  }, TX_OPTIONS);
  notifyOrder(storeId, result.id, "customer-cancelled");
  return result;
}

// ---------------------------------------------------------------- customer: return

export const customerReturnSchema = z
  .object({ reason: z.string().trim().min(1).max(500), note: z.string().trim().max(500).optional() })
  .strict();
export type CustomerReturnInput = z.infer<typeof customerReturnSchema>;


/**
 * The customer asks to return the WHOLE order. Needs: returns on, the order at the final stage, no return yet,
 * and the window (days since the final stage) still open. Checked again here under the lock. Throws OrderError.
 */
export async function customerRequestReturn(storeId: string, customerId: string, ref: OrderRef, input: CustomerReturnInput) {
  const result = await prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref, customerId);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const { returns, statuses } = await getOrderSettingsTx(tx, storeId);
    const details = parseDetails(order.id, order.details);
    if (!returns.enabled) throw new OrderError("RETURNS_OFF", "This store does not take returns here. Please contact the store.");
    if (!isFinalStatus(statuses, order.status)) throw new OrderError("NOT_RETURNABLE", "This order cannot be returned yet.");
    if (details.return) throw new OrderError("RETURN_EXISTS", "A return was already requested for this order.");
    const since = reachedStatusAt(details, order.status);
    const until = since ? since.getTime() + returns.windowDays * 24 * 60 * 60 * 1000 : 0;
    if (!since || Date.now() > until) throw new OrderError("RETURN_WINDOW_CLOSED", `The ${returns.windowDays}-day return window has ended. Please contact the store.`);

    const first = returns.statuses[0];
    details.return = { status: first, reason: input.reason, note: input.note ? input.note : null, requestedAt: new Date().toISOString(), restocked: false };
    details.events.push(newEvent({ type: "return", status: first, message: `Return requested: ${input.reason}`, actor: "customer", customerVisible: true }));
    await saveOrder(tx, order.id, details, {});
    return { id: order.id };
  }, TX_OPTIONS);
  notifyOrder(storeId, result.id, "return-requested");
  return result;
}

/** The customer withdraws the return while it is still at the first return status. Throws OrderError. */
export async function customerWithdrawReturn(storeId: string, customerId: string, ref: OrderRef) {
  return prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref, customerId);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const { returns } = await getOrderSettingsTx(tx, storeId);
    const details = parseDetails(order.id, order.details);
    if (!details.return) throw new OrderError("NO_RETURN", "This order has no return");
    if (!mayWithdrawReturn(returns.statuses, details.return, details.returnWithdrawals)) {
      throw new OrderError("NOT_WITHDRAWABLE", "This return is already being handled and can no longer be cancelled here. Please contact the store.");
    }
    details.return = null;
    details.returnWithdrawals += 1; // one withdrawal per order: a second return cannot be withdrawn
    details.events.push(newEvent({ type: "return", message: "Customer cancelled the return request", actor: "customer", customerVisible: true }));
    await saveOrder(tx, order.id, details, {});
    return { id: order.id };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------- customer: change my note

export const customerEditSchema = z
  .object({
    customerNote: z.string().trim().max(2000).nullable(), // Markdown; null or "" clears it
  })
  .strict();
export type CustomerEdit = z.infer<typeof customerEditSchema>;

/** The customer changes the note of their own order, at any time. Throws OrderError. */
export async function customerEditOrder(storeId: string, customerId: string, ref: OrderRef, input: CustomerEdit) {
  return prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref, customerId);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const details = parseDetails(order.id, order.details);
    const next = input.customerNote && input.customerNote.trim() ? input.customerNote : null;
    if (next === details.customerNote) return { id: order.id, changed: false };
    details.customerNote = next;

    details.events.push(newEvent({ type: "system", message: "Customer updated the note", actor: "customer", customerVisible: true }));
    await saveOrder(tx, order.id, details, {});
    return { id: order.id, changed: true };
  }, TX_OPTIONS);
}

/** Appends one event under the lock (used by the email function and by tests). */
export async function appendOrderEvent(storeId: string, ref: OrderRef, event: Omit<OrderEvent, "id" | "at">) {
  return prismadb.$transaction(async (tx) => {
    const order = await lockOrder(tx, storeId, ref);
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    const details = parseDetails(order.id, order.details);
    details.events.push(newEvent(event));
    await saveOrder(tx, order.id, details, {});
    return { id: order.id };
  }, TX_OPTIONS);
}
