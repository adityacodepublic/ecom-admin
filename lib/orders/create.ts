import { revalidateProducts } from "@/lib/store-revalidate";
import { randomInt, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { lineTotalPaise, paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { OrderDetails, OrderItemSnapshot, detailsToJson, orderDetailsSchema } from "./details";
import { OrderError } from "./errors";
import { CANCELLED, COD, PaymentStatus, QUOTE, isQuote, normalizePaymentStatus } from "./status";
import { parseOrderSettings } from "./settings";
import { TX_OPTIONS, newEvent } from "./update";
import { notifyOrder } from "./notify";
import { addressInputSchema, fillProfile, isProfileComplete, profileCreateSchema } from "./customer";
import { COUNTRY } from "./india";

/**
 * Checkout: creates one order. Everything is decided on the server:
 *  - the customer id comes from the verified header (the route), never from the body
 *  - products must belong to this store and not be archived; quantity 1..maxQuantity and <= stock
 *  - prices come from the database; the whole order is refused on any problem
 *  - stock is taken in the SAME transaction (UPDATE ... WHERE quantity >= n), so it can never oversell
 *  - orderNumber = a random 5-digit number that this store has not used yet (never repeats: a unique index, and a clash
 *    retries the whole transaction). Not a count: a shopper must not learn from #N how many orders the store has had.
 *    Only when a store has used nearly all 90,000 five-digit numbers do new ones get 6 (then 7) digits
 *  - the same cart by the same customer within 60 s returns the order that already exists (no second order, no second stock take)
 *  - a cart with a price-on-request product (Product.price empty) becomes a QUOTE request: the order waits at the
 *    reserved status "Quote", with no payment method and no stock taken; the products are only checked. The seller
 *    sends the prices and the customer's yes takes the stock (lib/orders/quote.ts).
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
    // For a quote: the total of the priced products.
    expectedTotalPaise: z.number().int().min(0).optional(),
    // What the customer saw: a quote request (some product had no price) or a priced order. If given and the
    // products say otherwise now (the seller switched "Price on request"), the order is refused (PRICE_CHANGED).
    quote: z.boolean().optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutResult = {
  id: string;
  orderNumber: number;
  status: string; // the first status of the store's list, or "Quote" for a quote request
  paymentStatus: PaymentStatus; // "PENDING" for a new order; a duplicate answer shows the existing order's current one
  payment: string;
  totalPaise: number;
};

const MAX_ATTEMPTS = 10;

/** A repeat of the same cart by the same customer within this time is the same order (double click, retry after a timeout). */
export const DUPLICATE_WINDOW_MS = 60_000;

/** How many times an order-number clash made us retry (since start). For the safety test and logs. */
export const orderNumberRetries = { count: 0 };
/** Where order numbers come from: a random number with this many digits (5 -> 10000..99999). The safety test swaps `next` to force clashes. */
export const orderNumbers = { next: (digits: number) => randomInt(10 ** (digits - 1), 10 ** digits) };
/** Numbers tried per order, in this order: mostly 5 digits; wider ones only if all the 5-digit ones are taken. */
const NUMBER_TRIES: [digits: number, count: number][] = [
  [5, 24],
  [6, 8],
  [7, 8],
];
/** Every tried number is taken (only when a store has used almost all of them): retried like a clash. */
class NoFreeOrderNumber extends Error {}
/** How many checkouts were answered with an order that already existed (duplicate protection). For the safety test and logs. */
export const duplicateOrders = { count: 0 };

/** A raw statement that failed: Prisma wraps the Postgres error (code in meta.code, e.g. 23505 unique, 40P01 deadlock). */
const pgCode = (e: Prisma.PrismaClientKnownRequestError) => String((e.meta as { code?: unknown } | undefined)?.code ?? "");
const isOrderNumberClash = (e: unknown) =>
  e instanceof NoFreeOrderNumber ||
  (e instanceof Prisma.PrismaClientKnownRequestError &&
  (e.code === "P2034" ||
    (e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes("orderNumber")) ||
    (e.code === "P2010" && (pgCode(e) === "40P01" || pgCode(e) === "40001" || (pgCode(e) === "23505" && JSON.stringify(e.meta ?? {}).includes("orderNumber"))))));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Profile = { fname: string; phone: string };
type Address = { id: string; street: string; city: string; state: string; country: string; pincode: number; instructions: string | null };

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
  // A quote request has no payment step: the method is set when the customer accepts the price.
  if (settings.checkoutPaymentStep && input.quote !== true) {
    if (input.paymentMethod !== COD) throw new OrderError("PAYMENT_METHOD_REQUIRED", "Choose a payment method (Cash on delivery)");
    payment = COD;
  }

  // Profile: filled on the first order only (a bare row made by a first saved address counts as no profile).
  // Two first orders at once: one wins quietly.
  let profile: Profile | null = isProfileComplete(found) ? found : null;
  if (!profile) {
    if (!input.contact) throw new OrderError("PROFILE_REQUIRED", "Name, email and phone are needed for the first order");
    await fillProfile(customerId, input.contact);
    profile = { fname: input.contact.fname, phone: input.contact.phone }; // this order's receiver is input.contact anyway
  }

  let address: Address | null = null;
  if ("addressId" in input.address) {
    if (!savedAddress) throw new OrderError("ADDRESS_NOT_FOUND", "Address not found");
    address = savedAddress;
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const { result, duplicate, soldOut } = await prismadb.$transaction((tx) => placeOrder(tx, storeId, customerId, payment, settings.statuses[0], input, profile!, address), TX_OPTIONS);
      if (duplicate) duplicateOrders.count++;
      else {
        // Stock was taken. The storefront needs to hear about it only when a product just sold out (10 -> 8 changes nothing it caches).
        revalidateProducts(storeId, soldOut, { listingChanged: true });
        notifyOrder(storeId, result.id, isQuote(result.status) ? "quote-requested" : "placed");
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
  const prices = await tx.$queryRaw<{ id: string; price: Prisma.Decimal | null }[]>`SELECT id, price FROM "Product" WHERE id = ANY(${ids}::text[]) AND "storeId" = ${storeId}`;
  if (prices.length !== ids.length) return null;
  const unit = new Map(prices.map((p) => [p.id, p.price === null ? 0 : toPaise(p.price)])); // a price-on-request line counts 0, as in the order
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
): Promise<{ result: CheckoutResult; duplicate: boolean; soldOut: SoldOut[] }> {
  // 0. One checkout at a time per customer and store (released at commit). Lock order is always: customer -> product rows (by id) -> order insert.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${storeId}:${customerId}`}))`;
  const dup = await findDuplicate(tx, storeId, customerId, input);
  if (dup) return { result: dup, duplicate: true, soldOut: [] };

  // 1. The address: the customer's own (read before the transaction), or a new one for this customer.
  let address: Address;
  if (savedAddress) {
    address = savedAddress;
  } else {
    const a = (input.address as { new: z.infer<typeof addressInputSchema> }).new;
    address = await tx.address.create({
      data: { usersId: customerId, street: a.street, city: a.city, state: a.state, country: COUNTRY, pincode: Number(a.pincode), instructions: a.instructions ?? "" },
    });
  }

  // 2. Which order this is: a cart with a price-on-request product (no price) is a quote request. A priced order takes
  //    its stock now; a quote only checks the products (its stock is taken when the customer accepts the price).
  const products = await tx.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) }, storeId }, select: productCheckSelect });
  const quote = products.some((p) => p.price === null);
  const { taken, soldOut } = quote ? { taken: checkProducts(input.items, products), soldOut: [] } : await takeStock(tx, storeId, input.items);
  if (!quote && Array.from(taken.values()).some((p) => p.price === null)) quoteMismatch(); // switched to "Price on request" just now

  // 3. Money, exact, from the database prices. Items keep the cart's order. A price-on-request line is 0 until the seller prices it.
  const items: OrderItemSnapshot[] = input.items.map((i) => {
    const p = taken.get(i.productId)!;
    return p.price === null
      ? { productId: i.productId, name: p.name, pricePaise: 0, quantity: i.quantity, onRequest: true }
      : { productId: i.productId, name: p.name, pricePaise: toPaise(p.price), quantity: i.quantity };
  });
  const subtotalPaise = sumPaise(items.map((i) => lineTotalPaise(i.pricePaise, i.quantity)));
  const shippingPaise = 0; // no shipping rules yet
  const totalPaise = sumPaise([subtotalPaise, shippingPaise]);
  const changed = () =>
    new OrderError("PRICE_CHANGED", "Prices changed since you opened the cart. Please check the new total.", {
      totalPaise,
      quote,
      items: items.map(({ productId, name, pricePaise, onRequest }) => ({ productId, name, pricePaise: onRequest ? null : pricePaise })),
    });
  if (input.quote !== undefined && input.quote !== quote) throw changed();
  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== totalPaise) throw changed();

  // 4. The frozen details.
  const status = quote ? QUOTE : startStatus;
  const details: OrderDetails = orderDetailsSchema.parse({
    v: 1,
    events: [newEvent({ type: "status", status, message: quote ? "Quote requested" : "Order placed", actor: "customer", customerVisible: true })],
    shipTo: {
      name: input.contact?.fname ?? profile.fname,
      phone: input.contact?.phone ?? profile.phone,
      street: address.street,
      city: address.city,
      state: address.state,
      country: address.country,
      pincode: String(address.pincode),
      instructions: address.instructions ?? "",
    },
    expectedDelivery: null,
    privateNote: null,
    customerNote: input.customerNote ? input.customerNote : null,
    adminContent: null,
    money: { subtotalPaise, shippingPaise, totalPaise },
    items,
    charges: [],
    quote: quote ? { state: "requested", sentAt: null, decidedAt: null } : null,
    stockReserved: !quote,
    returnWithdrawals: 0,
    return: null,
  });
  if (quote) payment = ""; // agreed when the customer accepts the price

  // 5. The number: the first of some random ones that this store does not have yet. Two orders at the same moment can
  //    still pick the same one; then the unique index refuses the second and createOrder retries the whole transaction
  //    (stock included) with new numbers. So a number never repeats in a store.
  const candidates = NUMBER_TRIES.flatMap(([digits, count]) => Array.from({ length: count }, () => orderNumbers.next(digits)));
  const [free] = await tx.$queryRaw<{ n: number }[]>`
    SELECT c.n FROM unnest(${candidates}::int[]) WITH ORDINALITY AS c(n, k)
    WHERE NOT EXISTS (SELECT 1 FROM "Order" x WHERE x."storeId" = ${storeId} AND x."orderNumber" = c.n)
    ORDER BY c.k LIMIT 1`;
  if (!free) throw new NoFreeOrderNumber();

  // 6. The order and its items in ONE statement.
  //    Times are written as UTC text (the columns are timestamp without time zone, like Prisma writes them).
  const now = new Date().toISOString();
  const orderId = randomUUID();
  const itemIds = items.map(() => randomUUID());
  const [order] = await tx.$queryRaw<{ id: string; orderNumber: number }[]>`
    WITH o AS (
      INSERT INTO "Order" (id, "storeId", "orderNumber", "usersId", "addressId", total, details, payment, "paymentStatus", status, "createdAt", "updatedAt")
      VALUES (${orderId}, ${storeId}, ${free.n}, ${customerId}, ${address.id}, ${paiseToDecimalString(totalPaise)}::numeric,
             ${JSON.stringify(detailsToJson(details))}::jsonb, ${payment}, 'PENDING', ${status}, ${now}::timestamp, ${now}::timestamp)
      RETURNING id, "orderNumber"
    ), i AS (
      INSERT INTO "OrderItem" (id, "orderId", "productId", "orderQuantity")
      SELECT w.id, o.id, w.pid, w.qty FROM o, unnest(${itemIds}::text[], ${items.map((i) => i.productId)}::text[], ${items.map((i) => i.quantity)}::int[]) AS w(id, pid, qty)
    )
    SELECT id, "orderNumber" FROM o`;

  // 7. The ordered products leave the shopper's saved cart (lib/cart.ts), whatever the browser does next.
  await tx.cartItem.deleteMany({ where: { storeId, customerId, productId: { in: items.map((i) => i.productId) } } });

  return { result: { id: order.id, orderNumber: order.orderNumber, status, paymentStatus: "PENDING", payment, totalPaise }, duplicate: false, soldOut };
}

// ---------------------------------------------------------------- stock

type Wanted = { productId: string; quantity: number };
type ProductRow = { id: string; name: string; price: Prisma.Decimal | null; maxQuantity: number };
/** A product whose stock just reached 0, with its category (the storefront refreshes both). */
export type SoldOut = { id: string; categoryId: string };

const productCheckSelect = { id: true, name: true, price: true, quantity: true, maxQuantity: true, isArchived: true } satisfies Prisma.ProductSelect;
type CheckedProduct = Prisma.ProductGetPayload<{ select: typeof productCheckSelect }>;

const byId = (a: Wanted, b: Wanted) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0);

/** The refusals of a checkout, in one place: not sold here (or archived), or not enough stock. */
function refuse(item: Wanted, p: { name: string; quantity: number; isArchived: boolean } | undefined): never {
  if (!p || p.isArchived) {
    throw new OrderError("PRODUCT_UNAVAILABLE", p ? `${p.name} is no longer sold` : "A product in the cart is not sold in this store", { productId: item.productId });
  }
  throw new OrderError("OUT_OF_STOCK", `Only ${Math.max(p.quantity, 0)} of ${p.name} left`, { productId: item.productId, available: Math.max(p.quantity, 0) });
}
/** ... and over the per-order limit. */
function checkLimit(item: Wanted, p: ProductRow) {
  if (item.quantity > p.maxQuantity) {
    throw new OrderError("QUANTITY_LIMIT", `At most ${p.maxQuantity} of ${p.name} per order`, { productId: item.productId, maxQuantity: p.maxQuantity });
  }
}

/** The seller switched a product's "Price on request" between our two reads: the customer must look again. */
function quoteMismatch(): never {
  throw new OrderError("PRICE_CHANGED", "Prices changed since you opened the cart. Please check your cart again.");
}

/** A quote request: the same checks as taking the stock, without taking it (first problem in id order). */
function checkProducts(items: Wanted[], products: CheckedProduct[]): Map<string, ProductRow> {
  const found = new Map(products.map((p) => [p.id, p]));
  for (const item of [...items].sort(byId)) {
    const p = found.get(item.productId);
    if (!p || p.isArchived || p.quantity < item.quantity) refuse(item, p);
    checkLimit(item, p);
  }
  return found;
}

/**
 * Takes the stock of ALL products in ONE statement. The rows are locked first in id order (no deadlocks), then the
 * WHERE is the guard: only this store, not archived, enough left. A missing row means a refusal (OrderError): the
 * caller's transaction rolls back, so the products we did change get their stock back. Used by checkout and by a
 * customer accepting a quote (lib/orders/quote.ts). Also returns the ids that just ran out (stock reached 0).
 */
export async function takeStock(tx: Prisma.TransactionClient, storeId: string, items: Wanted[]): Promise<{ taken: Map<string, ProductRow>; soldOut: SoldOut[] }> {
  const wanted = [...items].sort(byId);
  const ids = wanted.map((i) => i.productId);
  const qtys = wanted.map((i) => i.quantity);
  const rows = await tx.$queryRaw<(ProductRow & { left: number; categoryId: string })[]>`
    WITH want AS (SELECT * FROM unnest(${ids}::text[], ${qtys}::int[]) AS w(id, qty)),
    locked AS (SELECT p.id FROM "Product" p WHERE p.id = ANY(${ids}::text[]) AND p."storeId" = ${storeId} ORDER BY p.id FOR UPDATE)
    UPDATE "Product" p SET quantity = p.quantity - want.qty, "updatedAt" = now()
    FROM want, locked
    WHERE p.id = want.id AND p.id = locked.id AND p."isArchived" = false AND p.quantity >= want.qty
    RETURNING p.id, p.name, p.price, p."maxQuantity", p.quantity AS "left", p."categoryId"`;
  const taken = new Map(rows.map((r) => [r.id, r]));
  // Refuse with the first problem in id order (unavailable / out of stock / quantity limit).
  let missing: Map<string, { name: string; quantity: number; isArchived: boolean }> | null = null;
  for (const item of wanted) {
    const p = taken.get(item.productId);
    if (!p) {
      missing ??= new Map(
        (await tx.product.findMany({ where: { id: { in: ids.filter((id) => !taken.has(id)) }, storeId }, select: { id: true, name: true, quantity: true, isArchived: true } })).map((r) => [r.id, r]),
      );
      refuse(item, missing.get(item.productId));
    }
    checkLimit(item, p);
  }
  // The guard (quantity >= want) means every row had stock before, so "nothing left now" is exactly "just sold out".
  return { taken, soldOut: rows.filter((r) => r.left <= 0).map((r) => ({ id: r.id, categoryId: r.categoryId })) };
}
