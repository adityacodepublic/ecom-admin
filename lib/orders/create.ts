import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { lineTotalPaise, paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { OrderDetails, OrderItemSnapshot, detailsToJson, orderDetailsSchema } from "./details";
import { OrderError } from "./errors";
import { CANCELLED, COD, PaymentStatus, normalizePaymentStatus } from "./status";
import { parseOrderSettings } from "./settings";
import { TX_OPTIONS, newEvent } from "./update";
import { notifyOrder } from "./notify";
import { addressInputSchema, profileCreateSchema } from "./customer";

/**
 * Checkout: creates one order. Everything is decided on the server:
 *  - the customer id comes from the verified header (the route), never from the body
 *  - products must belong to this store and not be archived; quantity 1..maxQuantity and <= stock
 *  - prices come from the database; the whole order is refused on any problem
 *  - stock is taken in the SAME transaction (UPDATE ... WHERE quantity >= n), so it can never oversell
 *  - orderNumber = this store's max + 1, unique per store; a clash retries the whole transaction
 *  - the same cart by the same customer within 60 s returns the order that already exists (no second order, no second stock take)
 */

export const checkoutSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(100),
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1, "The cart is empty")
      .max(50, "Too many different products in one order")
      .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "The same product is in the cart twice"),
    // A saved address of this customer, or a new one (saved to the customer's addresses).
    address: z.union([z.object({ addressId: z.string().trim().min(1) }).strict(), z.object({ new: addressInputSchema }).strict()]),
    // Receiver name/phone/email for THIS order. Also creates the customer profile on the first order only;
    // an existing profile is never changed here (use PATCH /customer/me).
    contact: profileCreateSchema.optional(),
    customerNote: z.string().trim().max(2000).optional(), // Markdown
    // Required ("COD") when the store's checkoutPaymentStep is on. Ignored when it is off.
    paymentMethod: z.literal(COD).optional(),
    // The total the customer saw. If given and the server total differs, the order is refused (PRICE_CHANGED).
    expectedTotalPaise: z.number().int().min(0).optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutResult = {
  id: string;
  orderNumber: number;
  status: string; // the first status of the store's list
  paymentStatus: PaymentStatus; // "PENDING" for a new order; a duplicate answer shows the existing order's current one
  payment: string;
  totalPaise: number;
};

const MAX_ATTEMPTS = 10;

/** A repeat of the same cart by the same customer within this time is the same order (double click, retry after a timeout). */
export const DUPLICATE_WINDOW_MS = 60_000;

/** How many times an order-number clash made us retry (since start). For the safety test and logs. */
export const orderNumberRetries = { count: 0 };
/** How many checkouts were answered with an order that already existed (duplicate protection). For the safety test and logs. */
export const duplicateOrders = { count: 0 };

/** A raw statement that failed: Prisma wraps the Postgres error (code in meta.code, e.g. 23505 unique, 40P01 deadlock). */
const pgCode = (e: Prisma.PrismaClientKnownRequestError) => String((e.meta as { code?: unknown } | undefined)?.code ?? "");
const isOrderNumberClash = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  (e.code === "P2034" ||
    (e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes("orderNumber")) ||
    (e.code === "P2010" && (pgCode(e) === "40P01" || pgCode(e) === "40001" || (pgCode(e) === "23505" && JSON.stringify(e.meta ?? {}).includes("orderNumber")))));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Profile = { fname: string; phone: string };
type Address = { id: string; value: string; pincode: number; instructions: string | null };

export async function createOrder(storeId: string, customerId: string, input: CheckoutInput): Promise<CheckoutResult> {
  // Everything that does not need the transaction is read before it, in parallel (one round trip of waiting, not three).
  const [store, found, savedAddress] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { id: true, settings: true } }),
    prismadb.users.findUnique({ where: { id: customerId }, select: { fname: true, phone: true } }),
    "addressId" in input.address ? prismadb.address.findFirst({ where: { id: input.address.addressId, usersId: customerId } }) : Promise.resolve(null),
  ]);
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  const settings = parseOrderSettings(store.settings);

  let payment = "";
  if (settings.checkoutPaymentStep) {
    if (input.paymentMethod !== COD) throw new OrderError("PAYMENT_METHOD_REQUIRED", "Choose a payment method (Cash on delivery)");
    payment = COD;
  }

  // Profile: created on the first order only. Two first orders at once: skipDuplicates makes one win quietly.
  let profile: Profile | null = found;
  if (!profile) {
    if (!input.contact) throw new OrderError("PROFILE_REQUIRED", "Name, email and phone are needed for the first order");
    await prismadb.users.createMany({
      data: [{ id: customerId, fname: input.contact.fname, email: input.contact.email, phone: input.contact.phone, imgurl: input.contact.imgurl ?? "" }],
      skipDuplicates: true,
    });
    profile = { fname: input.contact.fname, phone: input.contact.phone }; // this order's receiver is input.contact anyway
  }

  let address: Address | null = null;
  if ("addressId" in input.address) {
    if (!savedAddress) throw new OrderError("ADDRESS_NOT_FOUND", "Address not found");
    address = savedAddress;
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const { result, duplicate } = await prismadb.$transaction((tx) => placeOrder(tx, storeId, customerId, payment, settings.statuses[0], input, profile!, address), TX_OPTIONS);
      if (duplicate) duplicateOrders.count++;
      else {
        revalidateStoreCatalog(storeId); // stock was taken
        if (settings.autoEmails) void notifyOrder(storeId, result.id, "placed"); // emails: off unless autoEmails (no query when off), not built yet
      }
      return result;
    } catch (error) {
      if (isOrderNumberClash(error) && attempt < MAX_ATTEMPTS) {
        orderNumberRetries.count++;
        await sleep(5 + Math.random() * 20 * attempt);
        continue;
      }
      if (isOrderNumberClash(error)) throw new OrderError("BUSY", "Many orders at once, please try again");
      throw error;
    }
  }
}

const sameItems = (a: { productId: string; quantity: number }[], b: { productId: string; quantity: number }[]) => {
  if (a.length !== b.length) return false;
  const q = new Map(a.map((i) => [i.productId, i.quantity]));
  return b.every((i) => q.get(i.productId) === i.quantity);
};

/**
 * Duplicate protection (no client key). Called with this customer's advisory lock held, so two identical requests
 * (double click, retry) are serialized: the second one finds the first one's order here and returns it.
 * Same store + customer, created in the last 60 s (createdAt), not Cancelled, same products and quantities, same total.
 */
async function findDuplicate(tx: Prisma.TransactionClient, storeId: string, customerId: string, input: CheckoutInput): Promise<CheckoutResult | null> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const candidates = await tx.$queryRaw<
    { id: string; orderNumber: number; status: string; payment: string; paymentStatus: string; total: Prisma.Decimal; items: [string, number][] | null }[]
  >`
    SELECT o.id, o."orderNumber", o.status, o.payment, o."paymentStatus", o.total,
           (SELECT json_agg(json_build_array(i."productId", i."orderQuantity")) FROM "OrderItem" i WHERE i."orderId" = o.id) AS items
    FROM "Order" o
    WHERE o."storeId" = ${storeId} AND o."usersId" = ${customerId}
      AND o."createdAt" >= ${since}::timestamp
      AND o.status <> ${CANCELLED}
    ORDER BY o."createdAt" DESC`;
  const same = candidates.filter((c) => sameItems(input.items, (c.items ?? []).map(([productId, quantity]) => ({ productId, quantity }))));
  if (same.length === 0) return null;
  // Same cart: it is the same order only when the price is the same too (read only on this rare path).
  const ids = input.items.map((i) => i.productId);
  const prices = await tx.$queryRaw<{ id: string; price: Prisma.Decimal }[]>`SELECT id, price FROM "Product" WHERE id = ANY(${ids}::text[]) AND "storeId" = ${storeId}`;
  if (prices.length !== ids.length) return null;
  const unit = new Map(prices.map((p) => [p.id, toPaise(p.price)]));
  const totalPaise = sumPaise(input.items.map((i) => lineTotalPaise(unit.get(i.productId)!, i.quantity)));
  const hit = same.find((c) => toPaise(c.total) === totalPaise);
  return hit ? { id: hit.id, orderNumber: hit.orderNumber, status: hit.status, paymentStatus: normalizePaymentStatus(hit.paymentStatus), payment: hit.payment, totalPaise } : null;
}

async function placeOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  customerId: string,
  payment: string,
  startStatus: string,
  input: CheckoutInput,
  profile: Profile,
  savedAddress: Address | null,
): Promise<{ result: CheckoutResult; duplicate: boolean }> {
  // 0. One checkout at a time per customer and store (released at commit). Lock order is always: customer -> product rows (by id) -> order insert.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${storeId}:${customerId}`}))`;
  const dup = await findDuplicate(tx, storeId, customerId, input);
  if (dup) return { result: dup, duplicate: true };

  // 1. The address: the customer's own (read before the transaction), or a new one for this customer.
  let address: Address;
  if (savedAddress) {
    address = savedAddress;
  } else {
    const a = (input.address as { new: z.infer<typeof addressInputSchema> }).new;
    address = await tx.address.create({
      data: { usersId: customerId, value: a.value, pincode: Number(a.pincode), instructions: a.instructions ?? "" },
    });
  }

  // 2. Take the stock of ALL products in ONE statement. The rows are locked first in id order (no deadlocks), then the
  //    WHERE is the guard: only this store, not archived, enough left. A missing row means a refusal: the transaction
  //    rolls back (the products we did change get their stock back).
  const wanted = [...input.items].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const ids = wanted.map((i) => i.productId);
  const qtys = wanted.map((i) => i.quantity);
  const rows = await tx.$queryRaw<{ id: string; name: string; price: Prisma.Decimal; maxQuantity: number }[]>`
    WITH want AS (SELECT * FROM unnest(${ids}::text[], ${qtys}::int[]) AS w(id, qty)),
    locked AS (SELECT p.id FROM "Product" p WHERE p.id = ANY(${ids}::text[]) AND p."storeId" = ${storeId} ORDER BY p.id FOR UPDATE)
    UPDATE "Product" p SET quantity = p.quantity - want.qty, "updatedAt" = now()
    FROM want, locked
    WHERE p.id = want.id AND p.id = locked.id AND p."isArchived" = false AND p.quantity >= want.qty
    RETURNING p.id, p.name, p.price, p."maxQuantity"`;
  const taken = new Map(rows.map((r) => [r.id, r]));
  // Refuse with the first problem in id order (same answers as before: unavailable / out of stock / quantity limit).
  let missing: Map<string, { name: string; quantity: number; isArchived: boolean }> | null = null;
  for (const item of wanted) {
    const p = taken.get(item.productId);
    if (!p) {
      missing ??= new Map(
        (await tx.product.findMany({ where: { id: { in: ids.filter((id) => !taken.has(id)) }, storeId }, select: { id: true, name: true, quantity: true, isArchived: true } })).map((r) => [r.id, r]),
      );
      const m = missing.get(item.productId);
      if (!m || m.isArchived) {
        throw new OrderError("PRODUCT_UNAVAILABLE", m ? `${m.name} is no longer sold` : "A product in the cart is not sold in this store", { productId: item.productId });
      }
      throw new OrderError("OUT_OF_STOCK", `Only ${Math.max(m.quantity, 0)} of ${m.name} left`, { productId: item.productId, available: Math.max(m.quantity, 0) });
    }
    if (item.quantity > p.maxQuantity) {
      throw new OrderError("QUANTITY_LIMIT", `At most ${p.maxQuantity} of ${p.name} per order`, { productId: item.productId, maxQuantity: p.maxQuantity });
    }
  }

  // 3. Money, exact, from the database prices. Items keep the cart's order.
  const items: OrderItemSnapshot[] = input.items.map((i) => {
    const p = taken.get(i.productId)!;
    return { productId: i.productId, name: p.name, pricePaise: toPaise(p.price), quantity: i.quantity };
  });
  const subtotalPaise = sumPaise(items.map((i) => lineTotalPaise(i.pricePaise, i.quantity)));
  const shippingPaise = 0; // no shipping rules yet
  const totalPaise = sumPaise([subtotalPaise, shippingPaise]);
  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== totalPaise) {
    throw new OrderError("PRICE_CHANGED", "Prices changed since you opened the cart. Please check the new total.", {
      totalPaise,
      items: items.map(({ productId, name, pricePaise }) => ({ productId, name, pricePaise })),
    });
  }

  // 4. The frozen details.
  const details: OrderDetails = orderDetailsSchema.parse({
    v: 1,
    events: [newEvent({ type: "status", status: startStatus, message: "Order placed", actor: "customer", customerVisible: true })],
    shipTo: {
      name: input.contact?.fname ?? profile.fname,
      phone: input.contact?.phone ?? profile.phone,
      address: address.value,
      pincode: String(address.pincode),
      instructions: address.instructions ?? "",
    },
    expectedDelivery: null,
    privateNote: null,
    customerNote: input.customerNote ? input.customerNote : null,
    adminContent: null,
    money: { subtotalPaise, shippingPaise, totalPaise },
    items,
    stockReserved: true,
    returnWithdrawals: 0,
    return: null,
  });

  // 5. The order, its items AND its number in ONE statement. The number is this store's max + 1; a parallel order may
  //    take the same one: the unique index then refuses ours and createOrder retries the whole transaction (stock included).
  //    Times are written as UTC text (the columns are timestamp without time zone, like Prisma writes them).
  const now = new Date().toISOString();
  const orderId = randomUUID();
  const itemIds = items.map(() => randomUUID());
  const [order] = await tx.$queryRaw<{ id: string; orderNumber: number }[]>`
    WITH o AS (
      INSERT INTO "Order" (id, "storeId", "orderNumber", "usersId", "addressId", total, details, payment, "paymentStatus", status, "createdAt", "updatedAt")
      SELECT ${orderId}, ${storeId}, COALESCE(max("orderNumber"), 0) + 1, ${customerId}, ${address.id}, ${paiseToDecimalString(totalPaise)}::numeric,
             ${JSON.stringify(detailsToJson(details))}::jsonb, ${payment}, 'PENDING', ${startStatus}, ${now}::timestamp, ${now}::timestamp
      FROM "Order" WHERE "storeId" = ${storeId}
      RETURNING id, "orderNumber"
    ), i AS (
      INSERT INTO "OrderItem" (id, "orderId", "productId", "orderQuantity")
      SELECT w.id, o.id, w.pid, w.qty FROM o, unnest(${itemIds}::text[], ${items.map((i) => i.productId)}::text[], ${items.map((i) => i.quantity)}::int[]) AS w(id, pid, qty)
    )
    SELECT id, "orderNumber" FROM o`;

  // 6. The ordered products leave the shopper's saved cart (lib/cart.ts), whatever the browser does next.
  await tx.cartItem.deleteMany({ where: { storeId, customerId, productId: { in: items.map((i) => i.productId) } } });

  return { result: { id: order.id, orderNumber: order.orderNumber, status: startStatus, paymentStatus: "PENDING", payment, totalPaise }, duplicate: false };
}
