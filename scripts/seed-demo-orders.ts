/**
 * Fills the LOCAL store "store-shop" with realistic orders through the real code paths (the customer checkout, cancel
 * and return routes, and the admin status update), so the dashboard can be looked at with data:
 * ~50 orders over the last 30 days from 8 customers (some repeat buyers), paid on delivery, some cancelled (by the
 * customer with a reason, or by the store), some returned, some still waiting to be shipped.
 * Then the order times are spread over the 30 days (evening-heavy) and the status events follow them.
 *
 * It first REMOVES every order of that store (and the addresses and seed customers it made before), after putting the
 * stock of those orders back. Local database only. Run again any time to start over.
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/seed-demo-orders.ts
 */
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";
import { adminUpdateOrder } from "@/lib/orders/update";
import { parseDetails } from "@/lib/orders/details";
import * as ordersRoute from "@/app/api/[storeId]/customer/orders/route";
import * as cancelRoute from "@/app/api/[storeId]/customer/orders/[orderId]/cancel/route";
import * as returnRoute from "@/app/api/[storeId]/customer/orders/[orderId]/return/route";

const SECRET = "seed-secret-0123456789-0123456789-abcdef";
process.env.STORE_API_SECRET = SECRET;
process.env.NEXT_PUBLIC_TENANT_MODE = "path";
process.env.NEXT_PUBLIC_STORE_URL = "http://localhost:3001";

const SLUG = "store-shop";
const ORDERS = 50;
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

// A small deterministic random generator: the same data every run.
let seed = 20261121;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const CUSTOMERS = [
  { n: "Aarav Mehta", phone: "+91 98200 11111" },
  { n: "Diya Nair", phone: "+91 98450 22222" },
  { n: "Rohan Iyer", phone: "+91 98860 33333" },
  { n: "Sneha Reddy", phone: "+91 98480 44444" },
  { n: "Kabir Singh", phone: "+91 98110 55555" },
  { n: "Ishita Das", phone: "+91 98300 66666" },
  { n: "Vihaan Patel", phone: "+91 98250 77777" },
  { n: "Meera Joshi", phone: "+91 98220 88888" },
];
const PLACES = [
  { street: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
  { street: "4B Linking Road, Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050" },
  { street: "221 Indiranagar 2nd Stage", city: "Bengaluru", state: "Karnataka", pincode: "560038" },
  { street: "8 Anna Salai", city: "Chennai", state: "Tamil Nadu", pincode: "600002" },
  { street: "17 Banjara Hills Road No 3", city: "Hyderabad", state: "Telangana", pincode: "500034" },
  { street: "56 Connaught Place", city: "New Delhi", state: "Delhi", pincode: "110001" },
  { street: "3 Park Street", city: "Kolkata", state: "West Bengal", pincode: "700016" },
  { street: "90 CG Road, Navrangpura", city: "Ahmedabad", state: "Gujarat", pincode: "380009" },
  { street: "14 Koramangala 5th Block", city: "Bengaluru", state: "Karnataka", pincode: "560095" },
  { street: "27 Camp Area", city: "Pune", state: "Maharashtra", pincode: "411011" },
];
const CANCEL_REASONS = ["Ordered by mistake", "Found a better price", "Delivery is too slow", "Changed my mind"];
const RETURN_REASONS = ["Damaged", "Wrong item", "Not as described", "Changed my mind"];
// The hour an order is placed (shop time): quiet at night, busy from 7 to 10 pm.
const HOUR_WEIGHTS = [1, 1, 0, 0, 0, 1, 2, 4, 5, 6, 6, 7, 8, 7, 6, 6, 7, 8, 10, 12, 12, 10, 6, 3];
const pickHour = () => {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let h = 0; h < 24; h++) if ((r -= HOUR_WEIGHTS[h]) < 0) return h;
  return 20;
};
const DAY_WEIGHTS = [10, 7, 7, 7, 8, 11, 13]; // Sunday first

async function call(handler: (req: Request, ctx: any) => Promise<Response>, o: { params: Record<string, string>; body?: unknown; customer: string }) {
  const req = new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-store-secret": SECRET, "x-customer-id": o.customer },
    body: JSON.stringify(o.body ?? {}),
  });
  const res = await handler(req, { params: Promise.resolve(o.params) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  const store = await prismadb.store.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true, userId: true } });
  const storeId = store.id;
  const admin = store.userId;

  // ---- 1. remove the old orders (stock goes back first), the old-style addresses and earlier seed customers
  const old = await prismadb.order.findMany({ where: { storeId }, select: { id: true, details: true } });
  for (const o of old) {
    const d = parseDetails(o.id, o.details);
    if (d.stockReserved) {
      for (const i of d.items) await prismadb.product.updateMany({ where: { id: i.productId }, data: { quantity: { increment: i.quantity } } });
    }
  }
  await prismadb.order.deleteMany({ where: { storeId } });
  await prismadb.address.deleteMany({ where: { OR: [{ city: "" }, { usersId: { startsWith: "seed_" } }] } });
  await prismadb.users.deleteMany({ where: { id: { startsWith: "seed_" } } });
  console.log(`removed ${old.length} old orders`);

  // ---- 2. products to sell
  const products = await prismadb.product.findMany({ where: { storeId, isArchived: false, quantity: { gt: 60 } }, select: { id: true, name: true, price: true }, take: 14 });
  if (products.length < 6) throw new Error("Not enough products with stock");

  // ---- 3. the order times: spread over the last 30 days, evening-heavy
  const now = Date.now();
  const slots: number[] = [];
  while (slots.length < ORDERS) {
    const ago = between(0, 29);
    const t = new Date(now - ago * DAY);
    const dow = new Date(t.getTime() + 5.5 * HOUR).getUTCDay(); // shop weekday
    if (rnd() * 13 > DAY_WEIGHTS[dow]) continue;
    // shop midnight of that day + the hour + minutes
    const shopMidnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 5.5 * HOUR + (t.getUTCHours() + 5.5 >= 24 ? DAY : 0);
    const at = shopMidnight + pickHour() * HOUR + between(0, 59) * 60000 + between(0, 59) * 1000;
    if (at < now - 20 * 60000) slots.push(at);
  }
  slots.sort((a, b) => a - b);

  // ---- 4. place, progress and re-time every order
  const made: Record<string, number> = {};
  const bump = (k: string) => (made[k] = (made[k] ?? 0) + 1);
  const firstOrderDone = new Set<string>();
  const addressOf = new Map<string, string>(); // customer -> a saved address id (repeat buyers reuse it)

  for (let i = 0; i < ORDERS; i++) {
    const at = slots[i];
    const ageDays = (now - at) / DAY;
    const ci = rnd() < 0.55 ? between(0, 2) : between(0, CUSTOMERS.length - 1); // the first three buy most
    const c = CUSTOMERS[ci];
    const customerId = `seed_cust_${ci + 1}`;
    const lines = Array.from(new Set(Array.from({ length: between(1, 3) }, () => pick(products).id))).map((productId) => ({ productId, quantity: between(1, 2) }));

    let address: unknown;
    if (addressOf.has(customerId) && rnd() < 0.7) address = { addressId: addressOf.get(customerId) };
    else address = { new: { ...pick(PLACES), instructions: rnd() < 0.3 ? "Call before delivery" : "" } };

    const placed = await call(ordersRoute.POST, {
      params: { storeId },
      customer: customerId,
      body: {
        items: lines,
        address,
        ...(firstOrderDone.has(customerId) ? {} : { contact: { fname: c.n, email: `${c.n.split(" ")[0].toLowerCase()}@seed.example`, phone: c.phone } }),
        customerNote: rnd() < 0.15 ? "Please pack carefully" : undefined,
        paymentMethod: "COD",

      },
    });
    if (placed.status !== 201 && placed.status !== 200) {
      // expectedTotalPaise is required by the route: read it from the price list
      throw new Error(`checkout failed: ${placed.status} ${JSON.stringify(placed.body)}`);
    }
    firstOrderDone.add(customerId);
    const orderId: string = placed.body.order.id;
    const row = await prismadb.order.findUniqueOrThrow({ where: { id: orderId }, select: { addressId: true } });
    addressOf.set(customerId, row.addressId);

    // What happens to it depends on its age (an order from yesterday cannot be delivered yet).
    const ref = { id: orderId };
    const roll = rnd();
    const step = (status: string, extra: object = {}) => adminUpdateOrder(storeId, ref, admin, { status, ...extra });
    if (ageDays >= 4 && roll < 0.5) {
      for (const s of ["Confirmed", "Packed", "Shipped", "Out for delivery"]) await step(s);
      await step("Delivered", { paymentStatus: "PAID" });
      if (ageDays < 25 && rnd() < 0.16) {
        const r = await call(returnRoute.POST, { params: { storeId, orderId }, customer: customerId, body: { reason: pick(RETURN_REASONS) } });
        if (r.status === 200 || r.status === 201) bump("returned");
      }
      bump("delivered");
    } else if (roll < 0.62) {
      if (rnd() < 0.7) {
        await call(cancelRoute.POST, { params: { storeId, orderId }, customer: customerId, body: { reason: pick(CANCEL_REASONS) } });
        bump("cancelled by the customer");
      } else {
        await step("Cancelled");
        bump("cancelled by the store");
      }
    } else if (ageDays >= 2 && roll < 0.78) {
      await step("Confirmed");
      bump("confirmed, not shipped (waiting)");
    } else if (roll < 0.9) {
      for (const s of ["Confirmed", "Packed", "Shipped"]) await step(s);
      bump("shipped");
    } else {
      bump("just placed");
    }

    // ---- re-time: createdAt = the slot, each event after the one before (hours apart), nothing in the future
    const fresh = await prismadb.order.findUniqueOrThrow({ where: { id: orderId }, select: { details: true } });
    const d = parseDetails(orderId, fresh.details);
    let t = at;
    d.events.forEach((e, k) => {
      if (k > 0) t += (e.type === "status" ? between(6, 30) : between(20, 60)) * HOUR;
      e.at = new Date(Math.min(t, now - 60000)).toISOString();
    });
    await prismadb.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(at), details: JSON.parse(JSON.stringify(d)) as Prisma.InputJsonValue },
    });
  }

  console.log("seeded", ORDERS, "orders:", made);
  console.log("customers:", await prismadb.users.count({ where: { id: { startsWith: "seed_" } } }), "addresses:", await prismadb.address.count({ where: { usersId: { startsWith: "seed_" } } }));
  await prismadb.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prismadb.$disconnect();
  process.exit(1);
});
