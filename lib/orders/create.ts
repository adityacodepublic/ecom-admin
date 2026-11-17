import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { lineTotalPaise, paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { OrderDetails, OrderItemSnapshot, detailsToJson, orderDetailsSchema } from "./details";
import { OrderError } from "./errors";
import { COD } from "./status";
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
  paymentStatus: "PENDING";
  payment: string;
  totalPaise: number;
};

const MAX_ATTEMPTS = 10;

/** How many times an order-number clash made us retry (since start). For the safety test and logs. */
export const orderNumberRetries = { count: 0 };

const isOrderNumberClash = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  (e.code === "P2034" || (e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes("orderNumber")));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createOrder(storeId: string, customerId: string, input: CheckoutInput): Promise<CheckoutResult> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { id: true, orderSettings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  const settings = parseOrderSettings(store.orderSettings);

  let payment = "";
  if (settings.checkoutPaymentStep) {
    if (input.paymentMethod !== COD) throw new OrderError("PAYMENT_METHOD_REQUIRED", "Choose a payment method (Cash on delivery)");
    payment = COD;
  }

  // Profile: created on the first order only. Two first orders at once: skipDuplicates makes one win quietly.
  let profile = await prismadb.users.findUnique({ where: { id: customerId } });
  if (!profile) {
    if (!input.contact) throw new OrderError("PROFILE_REQUIRED", "Name, email and phone are needed for the first order");
    await prismadb.users.createMany({
      data: [{ id: customerId, fname: input.contact.fname, email: input.contact.email, phone: input.contact.phone, imgurl: input.contact.imgurl ?? "" }],
      skipDuplicates: true,
    });
    profile = await prismadb.users.findUniqueOrThrow({ where: { id: customerId } });
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await prismadb.$transaction((tx) => placeOrder(tx, storeId, customerId, payment, settings.statuses[0], input, profile!), TX_OPTIONS);
      void notifyOrder(storeId, result.id, "placed"); // emails: off unless autoEmails, and not built yet
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

async function placeOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  customerId: string,
  payment: string,
  startStatus: string,
  input: CheckoutInput,
  profile: { fname: string; phone: string },
): Promise<CheckoutResult> {
  // 1. The address: the customer's own, or a new one for this customer.
  let address: { id: string; value: string; pincode: number; instructions: string | null };
  if ("addressId" in input.address) {
    const found = await tx.address.findFirst({ where: { id: input.address.addressId, usersId: customerId } });
    if (!found) throw new OrderError("ADDRESS_NOT_FOUND", "Address not found");
    address = found;
  } else {
    const a = input.address.new;
    address = await tx.address.create({
      data: { usersId: customerId, value: a.value, pincode: Number(a.pincode), instructions: a.instructions ?? "" },
    });
  }

  // 2. Take the stock, product by product in id order (no deadlocks). The WHERE is the guard:
  //    only this store, not archived, enough left. 0 rows -> refuse the whole order (the transaction rolls back).
  const wanted = [...input.items].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const taken = new Map<string, { name: string; price: Prisma.Decimal; maxQuantity: number }>();
  for (const item of wanted) {
    const rows = await tx.$queryRaw<{ name: string; price: Prisma.Decimal; maxQuantity: number }[]>`
      UPDATE "Product" SET quantity = quantity - ${item.quantity}, "updatedAt" = now()
      WHERE id = ${item.productId} AND "storeId" = ${storeId} AND "isArchived" = false AND quantity >= ${item.quantity}
      RETURNING name, price, "maxQuantity"`;
    if (rows.length === 0) {
      const p = await tx.product.findFirst({
        where: { id: item.productId, storeId },
        select: { name: true, quantity: true, isArchived: true },
      });
      if (!p || p.isArchived) {
        throw new OrderError("PRODUCT_UNAVAILABLE", p ? `${p.name} is no longer sold` : "A product in the cart is not sold in this store", {
          productId: item.productId,
        });
      }
      throw new OrderError("OUT_OF_STOCK", `Only ${Math.max(p.quantity, 0)} of ${p.name} left`, {
        productId: item.productId,
        available: Math.max(p.quantity, 0),
      });
    }
    const p = rows[0];
    if (item.quantity > p.maxQuantity) {
      throw new OrderError("QUANTITY_LIMIT", `At most ${p.maxQuantity} of ${p.name} per order`, {
        productId: item.productId,
        maxQuantity: p.maxQuantity,
      });
    }
    taken.set(item.productId, p);
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
    return: null,
  });

  // 5. The next number for this store. A parallel order may take the same one: the unique index then
  //    refuses ours (P2002) and createOrder retries the whole transaction (stock included).
  const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
    SELECT (COALESCE(max("orderNumber"), 0) + 1)::int AS next FROM "Order" WHERE "storeId" = ${storeId}`;

  const order = await tx.order.create({
    data: {
      storeId,
      orderNumber: next,
      usersId: customerId,
      addressId: address.id,
      total: paiseToDecimalString(totalPaise),
      details: detailsToJson(details),
      payment,
      paymentStatus: "PENDING",
      status: startStatus,
      orderItems: { create: items.map((i) => ({ productId: i.productId, orderQuantity: i.quantity })) },
    },
    select: { id: true, orderNumber: true },
  });

  return { id: order.id, orderNumber: order.orderNumber, status: startStatus, paymentStatus: "PENDING", payment, totalPaise };
}
