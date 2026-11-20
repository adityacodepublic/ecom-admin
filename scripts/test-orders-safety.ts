/**
 * Proves the order safety rules on the LOCAL database. No Cloudinary, no emails, no payment gateway.
 * Customer routes are called through their real route handlers (so the checks are on the real JSON
 * response); admin actions through lib/orders (the routes only add the Clerk owner check on top).
 * It creates throw-away stores (slug zz-ord-test-*) and removes everything it created at the end.
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-orders-safety.ts
 */
import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { formatINR, lineTotalPaise, paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { orderDetailsSchema, parseDetails } from "@/lib/orders/details";
import { adminUpdateOrder, appendOrderEvent } from "@/lib/orders/update";
import { getAdminOrder, getOrderStats, listAdminOrders } from "@/lib/orders/queries";
import { updateContact } from "@/lib/contact";
import { updateOrderSettings } from "@/lib/orders/settings";
import { OrderError, isOrderError } from "@/lib/orders/errors";
import { duplicateOrders, orderNumberRetries } from "@/lib/orders/create";
import * as ordersRoute from "@/app/api/[storeId]/customer/orders/route";
import * as orderRoute from "@/app/api/[storeId]/customer/orders/[orderId]/route";
import * as cancelRoute from "@/app/api/[storeId]/customer/orders/[orderId]/cancel/route";
import * as returnRoute from "@/app/api/[storeId]/customer/orders/[orderId]/return/route";
import * as meRoute from "@/app/api/[storeId]/customer/me/route";
import * as addressRoute from "@/app/api/[storeId]/customer/addresses/[addressId]/route";
import * as settingsRoute from "@/app/api/[storeId]/order-settings/route";

const SECRET = "test-secret-0123456789-0123456789-abcdef";
process.env.STORE_API_SECRET = SECRET;
process.env.NEXT_PUBLIC_TENANT_MODE = "path";
process.env.NEXT_PUBLIC_STORE_URL = "http://localhost:3001";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
}

const TAG = `zz-ord-test-${Date.now()}`;
const OWNER = "zz-ord-test-owner";
const C1 = `zz_ord_c1_${Date.now()}`;
const C2 = `zz_ord_c2_${Date.now()}`;
const createdStores: string[] = [];
const createdUsers = [C1, C2];

type Res = { status: number; body: any; headers: Headers };
async function call(
  handler: (req: Request, ctx: any) => Promise<Response>,
  opts: { method?: string; path?: string; params: Record<string, string>; body?: unknown; customer?: string | null; secret?: string | null; origin?: string },
): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  if (secret !== null) headers["x-store-secret"] = secret;
  if (opts.customer) headers["x-customer-id"] = opts.customer;
  if (opts.origin) headers["origin"] = opts.origin;
  const req = new Request(`http://localhost/api/x${opts.path ?? ""}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function makeStore(name: string, settings?: object) {
  const store = await prismadb.store.create({
    data: { name, userId: OWNER, slug: `${TAG}-${name}`.toLowerCase(), settings: settings ? { orders: settings } : Prisma.DbNull },
  });
  createdStores.push(store.id);
  const category = await prismadb.category.create({ data: { storeId: store.id, name: "t", imageUrl: "" } });
  const product = (name: string, price: string, quantity: number, maxQuantity = 10, isArchived = false) =>
    prismadb.product.create({ data: { storeId: store.id, categoryId: category.id, name, price, quantity, maxQuantity, isArchived } });
  return { store, product };
}

const stockOf = async (id: string) => (await prismadb.product.findUniqueOrThrow({ where: { id } })).quantity;
const contact = (n: string) => ({ fname: `Test ${n}`, email: `${n}@example.com`, phone: "+91 98765 43210" });
const newAddress = { new: { value: "12 MG Road, Pune", pincode: "411001", instructions: "Ring bell" } };

/** Makes an order older than the 60 s duplicate window (so a repeat of the same cart is a new order). */
const age = (orderId: string, seconds = 120) => prismadb.order.update({ where: { id: orderId }, data: { createdAt: new Date(Date.now() - seconds * 1000) } });

const checkout = (storeId: string, customer: string, body: object) =>
  call(ordersRoute.POST, { method: "POST", params: { storeId }, customer, body });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  console.log(`Database host: ${new URL(url).host}`);

  // ------------------------------------------------------------ 1. money
  check("money: 19.99 x 3 = 59.97 exactly", lineTotalPaise(toPaise("19.99"), 3) === 5997 && paiseToDecimalString(5997) === "59.97");
  check("money: 0.10 + 0.20 = 0.30 exactly", sumPaise([toPaise("0.10"), toPaise("0.20")]) === 30);
  check("money: Decimal 19.99 -> 1999", toPaise(new Prisma.Decimal("19.99")) === 1999);
  check("money: number 19.99 -> 1999 (read via its text, not * 100)", toPaise(19.99) === 1999 && 19.99 * 100 !== 1999);
  check("money: 1,00,000.05 x 7 = 7,00,000.35", paiseToDecimalString(lineTotalPaise(toPaise("100000.05"), 7)) === "700000.35");
  check("money: Indian format", formatINR(123456789) === "₹12,34,567.89" && formatINR(5) === "₹0.05");
  let threw = false;
  try {
    toPaise("19.999");
  } catch {
    threw = true;
  }
  check("money: 3 decimals refused", threw);

  // ------------------------------------------------------------ setup
  const A = await makeStore("A");
  const B = await makeStore("B");
  const shirt = await A.product("Shirt", "19.99", 50, 10);
  const mug = await A.product("Mug", "0.10", 10, 10);
  const old = await A.product("Old", "5.00", 10, 10, true);
  const otherStore = await B.product("B item", "1.00", 10, 10);

  // ------------------------------------------------------------ 2. auth on customer routes
  const listA = (customer: string | null, secret?: string | null) =>
    call(ordersRoute.GET, { params: { storeId: A.store.id }, customer, secret });
  check("auth: no secret -> 401", (await listA(C1, null)).status === 401);
  check("auth: wrong secret -> 401", (await listA(C1, "x".repeat(40))).status === 401);
  check("auth: secret but no customer id -> 401", (await listA(null)).status === 401);
  delete process.env.STORE_API_SECRET;
  const closed = await listA(C1);
  process.env.STORE_API_SECRET = SECRET;
  check("auth: secret not configured -> closed (500 NOT_CONFIGURED)", closed.status === 500 && closed.body.error.code === "NOT_CONFIGURED");
  check("auth: right secret -> 200", (await listA(C1)).status === 200);

  // ------------------------------------------------------------ 3. checkout validation (whole order refused)
  const shirtStock = await stockOf(shirt.id);
  const bad = async (name: string, customer: string, body: object, code: string) => {
    const r = await checkout(A.store.id, customer, body);
    check(`checkout refused: ${name} -> ${code}`, r.body?.error?.code === code, r.body);
  };
  await bad("first order without contact", C1, { items: [{ productId: shirt.id, quantity: 1 }], address: newAddress, paymentMethod: "COD" }, "PROFILE_REQUIRED");
  await bad("quantity 0", C1, { items: [{ productId: shirt.id, quantity: 0 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "VALIDATION");
  await bad("quantity 1.5", C1, { items: [{ productId: shirt.id, quantity: 1.5 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "VALIDATION");
  await bad("negative quantity", C1, { items: [{ productId: shirt.id, quantity: -5 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "VALIDATION");
  await bad("usersId in the body", C1, { usersId: C2, items: [{ productId: shirt.id, quantity: 1 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "VALIDATION");
  await bad("same product twice", C1, { items: [{ productId: shirt.id, quantity: 1 }, { productId: shirt.id, quantity: 1 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "VALIDATION");
  await bad("no payment method while the payment step is on", C1, { items: [{ productId: shirt.id, quantity: 1 }], address: newAddress, contact: contact("c1") }, "PAYMENT_METHOD_REQUIRED");
  await bad("card payment", C1, { items: [{ productId: shirt.id, quantity: 1 }], address: newAddress, contact: contact("c1"), paymentMethod: "card" }, "VALIDATION");
  await bad("another store's product", C1, { items: [{ productId: shirt.id, quantity: 1 }, { productId: otherStore.id, quantity: 1 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "PRODUCT_UNAVAILABLE");
  await bad("archived product", C1, { items: [{ productId: old.id, quantity: 1 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "PRODUCT_UNAVAILABLE");
  await bad("more than maxQuantity", C1, { items: [{ productId: shirt.id, quantity: 11 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "QUANTITY_LIMIT");
  await bad("more than the stock", C1, { items: [{ productId: mug.id, quantity: 11 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD" }, "OUT_OF_STOCK");
  await bad("price changed", C1, { items: [{ productId: shirt.id, quantity: 3 }], address: newAddress, contact: contact("c1"), paymentMethod: "COD", expectedTotalPaise: 5000 }, "PRICE_CHANGED");
  check("checkout refused: stock unchanged after all refusals", (await stockOf(shirt.id)) === shirtStock);
  check("checkout refused: no order was created", (await prismadb.order.count({ where: { storeId: A.store.id } })) === 0);

  // ------------------------------------------------------------ 4. a good order: exact money, frozen data
  // The saved cart (lib/cart.ts): the ordered products leave it, the rest stay.
  const cap = await A.product("Cap", "2.00", 10, 10);
  await prismadb.cartItem.createMany({
    data: [shirt.id, mug.id, cap.id].map((productId) => ({ storeId: A.store.id, customerId: C1, productId, quantity: 1 })),
  });
  const ok = await checkout(A.store.id, C1, {
    items: [{ productId: shirt.id, quantity: 3 }, { productId: mug.id, quantity: 1 }],
    address: newAddress,
    contact: contact("c1"),
    paymentMethod: "COD",
    expectedTotalPaise: 5997 + 10,
    customerNote: "Please call before **delivery**",
  });
  check("checkout: 201", ok.status === 201, ok.body);
  const o1 = ok.body.order;
  check("checkout: total 19.99 x 3 + 0.10 = 60.07 (6007 paise)", o1?.totalPaise === 6007);
  const row1 = await prismadb.order.findUniqueOrThrow({ where: { id: o1.id } });
  check("checkout: DB total column is 60.07", row1.total.toFixed(2) === "60.07");
  check("checkout: payment COD, PENDING, Placed, number 1", row1.payment === "COD" && row1.paymentStatus === "PENDING" && row1.status === "Placed" && row1.orderNumber === 1);
  const d1 = parseDetails(row1.id, row1.details);
  check("checkout: frozen items + shipTo", d1.items[0].pricePaise === 1999 && d1.items[0].name === "Shirt" && d1.shipTo.name === "Test c1" && d1.shipTo.pincode === "411001");
  check("checkout: stock taken", (await stockOf(shirt.id)) === shirtStock - 3 && (await stockOf(mug.id)) === 9);
  const savedCart = (await prismadb.cartItem.findMany({ where: { storeId: A.store.id, customerId: C1 } })).map((r) => r.productId);
  check("checkout: ordered products leave the saved cart, the rest stay", savedCart.length === 1 && savedCart[0] === cap.id, savedCart);
  // Price change later does not change the order
  await prismadb.product.update({ where: { id: shirt.id }, data: { price: "25.00" } });
  const again = await call(orderRoute.GET, { params: { storeId: A.store.id, orderId: o1.id }, customer: C1 });
  check("checkout: later price change does not touch the order", again.body.order.totalPaise === 6007 && again.body.order.items[0].pricePaise === 1999);
  // Profile is not overwritten by later orders
  const o2res = await checkout(A.store.id, C1, {
    items: [{ productId: shirt.id, quantity: 1 }],
    address: newAddress,
    contact: { fname: "Someone Else", email: "else@example.com", phone: "+91 90000 00000" },
    paymentMethod: "COD",
  });
  const profile = await prismadb.users.findUniqueOrThrow({ where: { id: C1 } });
  check("checkout: existing profile not overwritten", o2res.status === 201 && profile.fname === "Test c1" && profile.email === "c1@example.com");
  await age(o2res.body.order.id);
  check("checkout: receiver for that order is the one typed", parseDetails(o2res.body.order.id, (await prismadb.order.findUniqueOrThrow({ where: { id: o2res.body.order.id } })).details).shipTo.name === "Someone Else");

  // Someone else's address
  const c2first = await checkout(A.store.id, C2, { items: [{ productId: mug.id, quantity: 1 }], address: newAddress, contact: contact("c2"), paymentMethod: "COD" });
  const c1Address = row1.addressId;
  await bad("another customer's address", C2, { items: [{ productId: mug.id, quantity: 1 }], address: { addressId: c1Address }, paymentMethod: "COD" }, "ADDRESS_NOT_FOUND");
  const delOther = await call(addressRoute.DELETE, { method: "DELETE", params: { storeId: A.store.id, addressId: c1Address }, customer: C2 });
  check("address: cannot delete another customer's address", delOther.status === 404);
  const delUsed = await call(addressRoute.DELETE, { method: "DELETE", params: { storeId: A.store.id, addressId: c1Address }, customer: C1 });
  check("address: an address used by an order cannot be deleted", delUsed.status === 409 && delUsed.body.error.code === "ADDRESS_IN_USE");

  // ------------------------------------------------------------ 5. parallel orders: never oversell, never duplicate numbers
  const P = await makeStore("P");
  const last = await P.product("Last ten", "99.99", 10, 10);
  const plenty = await P.product("Plenty", "1.00", 1000, 10);
  const buyers = Array.from({ length: 25 }, (_, i) => `zz_ord_p${i}_${Date.now()}`);
  createdUsers.push(...buyers);
  const race = await Promise.all(
    buyers.map((b) => checkout(P.store.id, b, { items: [{ productId: last.id, quantity: 1 }], address: newAddress, contact: contact(b), paymentMethod: "COD" })),
  );
  const won = race.filter((r) => r.status === 201).length;
  const soldOut = race.filter((r) => r.body?.error?.code === "OUT_OF_STOCK").length;
  check(`parallel: 25 buyers, 10 in stock -> 10 orders, 15 OUT_OF_STOCK (got ${won} / ${soldOut})`, won === 10 && soldOut === 15, race.filter((r) => r.status !== 201 && r.body?.error?.code !== "OUT_OF_STOCK").map((r) => r.body));
  check("parallel: stock is exactly 0", (await stockOf(last.id)) === 0);
  const race2 = await Promise.all(
    buyers.slice(0, 20).map((b) => checkout(P.store.id, b, { items: [{ productId: plenty.id, quantity: 2 }], address: newAddress, paymentMethod: "COD" })),
  );
  check("parallel: 20 more orders at once all placed", race2.every((r) => r.status === 201), race2.filter((r) => r.status !== 201).map((r) => r.body));
  const numbers = (await prismadb.order.findMany({ where: { storeId: P.store.id }, select: { orderNumber: true } })).map((o) => o.orderNumber).sort((a, b) => a - b);
  check(`parallel: ${numbers.length} order numbers are unique and 1..${numbers.length}`, numbers.every((n, i) => n === i + 1), numbers);
  check("parallel: plenty stock = 1000 - 40", (await stockOf(plenty.id)) === 960);

  // Different products per buyer: no shared stock row lock, so the order-number clash + retry path really runs.
  const N = await makeStore("N");
  const own = await Promise.all(buyers.map((_, i) => N.product(`Own ${i}`, "10.00", 5, 5)));
  const retriesBefore = orderNumberRetries.count;
  const race3 = await Promise.all(
    buyers.map((b, i) => checkout(N.store.id, b, { items: [{ productId: own[i].id, quantity: 1 }], address: newAddress, paymentMethod: "COD" })),
  );
  const retries = orderNumberRetries.count - retriesBefore;
  check(`parallel: 25 buyers, 25 different products -> all placed (${retries} number clashes retried)`, race3.every((r) => r.status === 201), race3.filter((r) => r.status !== 201).map((r) => r.body));
  const numbers3 = (await prismadb.order.findMany({ where: { storeId: N.store.id }, select: { orderNumber: true } })).map((o) => o.orderNumber).sort((a, b) => a - b);
  check("parallel: those 25 numbers are unique and 1..25", numbers3.length === 25 && numbers3.every((n, i) => n === i + 1), numbers3);
  check("parallel: the retry path was really used (clashes > 0)", retries > 0, retries);

  // ------------------------------------------------------------ 6. parallel cancel: one cancel wins; stock is restored only by the admin button, once
  const shirtBefore = await stockOf(shirt.id);
  const toCancel = await checkout(A.store.id, C1, { items: [{ productId: shirt.id, quantity: 2 }], address: { addressId: c1Address }, paymentMethod: "COD" });
  const cid = toCancel.body.order.id;
  check("cancel: stock taken (-2)", (await stockOf(shirt.id)) === shirtBefore - 2);
  const cancels = await Promise.all([
    ...Array.from({ length: 6 }, () => call(cancelRoute.POST, { method: "POST", params: { storeId: A.store.id, orderId: cid }, customer: C1, body: { reason: "Changed my mind" } })),
    ...Array.from({ length: 4 }, () =>
      adminUpdateOrder(A.store.id, { id: cid }, OWNER, { status: "Cancelled" }).then(
        (r) => ({ status: r.changed ? 200 : 204, body: null }),
        (e) => ({ status: isOrderError(e) ? e.status : 500, body: { error: { code: isOrderError(e) ? e.code : String(e) } } }),
      ),
    ),
  ]);
  const okCancels = cancels.filter((r) => r.status === 200).length;
  check(`cancel: 10 parallel cancels (customer + admin) -> exactly 1 worked (got ${okCancels})`, okCancels === 1, cancels.map((c) => c.status));
  check("cancel: stock is NOT given back by cancelling", (await stockOf(shirt.id)) === shirtBefore - 2);
  const restores = await Promise.all(Array.from({ length: 4 }, () => adminUpdateOrder(A.store.id, { id: cid }, OWNER, { restoreStock: true }).then(() => "ok", () => "err")));
  check("cancel: 4 parallel restore clicks -> stock given back exactly once", restores.every((r) => r === "ok") && (await stockOf(shirt.id)) === shirtBefore);
  check("cancel: restoring stock on an open order is refused", (await adminUpdateOrder(A.store.id, { id: o1.id }, OWNER, { restoreStock: true }).then(() => "ok", (e) => (isOrderError(e) ? e.code : String(e)))) === "VALIDATION");
  const cancelled = parseDetails(cid, (await prismadb.order.findUniqueOrThrow({ where: { id: cid } })).details);
  check("cancel: exactly one Cancelled event", cancelled.events.filter((e) => e.status === "Cancelled").length === 1);
  check("cancel: final status Cancelled", (await prismadb.order.findUniqueOrThrow({ where: { id: cid } })).status === "Cancelled");
  const restoredDetails = parseDetails(cid, (await prismadb.order.findUniqueOrThrow({ where: { id: cid } })).details);
  check("cancel: stockReserved is false after the restore", restoredDetails.stockReserved === false);

  // ------------------------------------------------------------ 7. status machine
  const sm = (await checkout(A.store.id, C1, { items: [{ productId: shirt.id, quantity: 1 }], address: { addressId: c1Address }, paymentMethod: "COD" })).body.order;
  await age(sm.id);
  const tryUpdate = async (body: Parameters<typeof adminUpdateOrder>[3]) => {
    try {
      await adminUpdateOrder(A.store.id, { id: sm.id }, OWNER, body);
      return "ok";
    } catch (e) {
      return isOrderError(e) ? e.code : String(e);
    }
  };
  check("status: Placed -> Shipped refused (one step at a time)", (await tryUpdate({ status: "Shipped" })) === "INVALID_TRANSITION");
  check("status: Placed -> Confirmed allowed", (await tryUpdate({ status: "Confirmed" })) === "ok");
  check("status: Confirmed -> Packed allowed", (await tryUpdate({ status: "Packed" })) === "ok");
  check("status: Packed -> Confirmed (back one step) allowed", (await tryUpdate({ status: "Confirmed" })) === "ok" && (await tryUpdate({ status: "Packed" })) === "ok");
  check("status: an unknown status is refused", (await tryUpdate({ status: "Teleported" })) === "INVALID_TRANSITION");
  check("payment: PENDING -> REFUNDED and back is allowed (any move)", (await tryUpdate({ paymentStatus: "REFUNDED" })) === "ok" && (await tryUpdate({ paymentStatus: "PENDING" })) === "ok");
  check(
    "status: Packed -> Shipped with expected delivery",
    (await tryUpdate({ status: "Shipped", expectedDelivery: "2026-11-20" })) === "ok",
  );
  const lateCancel = await call(cancelRoute.POST, { method: "POST", params: { storeId: A.store.id, orderId: sm.id }, customer: C1, body: { reason: "Changed my mind" } });
  check("status: customer cannot cancel a Shipped order", lateCancel.body?.error?.code === "NOT_CANCELLABLE");
  check("expected delivery: a bad date is refused", (await tryUpdate({ expectedDelivery: "20-11-2026" })) !== "ok");
  check("notes: admin can save a note", (await tryUpdate({ privateNote: "NOTES-secret-do-not-show" })) === "ok");
  check("status: Shipped -> Delivered refused (Out for delivery first)", (await tryUpdate({ status: "Delivered" })) === "INVALID_TRANSITION");
  check("status: Out for delivery -> Delivered + COD paid", (await tryUpdate({ status: "Out for delivery" })) === "ok" && (await tryUpdate({ status: "Delivered", paymentStatus: "PAID" })) === "ok");
  check("freeze: Delivered (final) -> Cancelled refused STATUS_LOCKED", (await tryUpdate({ status: "Cancelled" })) === "STATUS_LOCKED");
  check("freeze: Delivered (final) -> back to Out for delivery refused STATUS_LOCKED", (await tryUpdate({ status: "Out for delivery" })) === "STATUS_LOCKED");
  const frozen = (await getAdminOrder(A.store.id, { id: sm.id }))!;
  check("freeze: admin view says FINAL, no next/prev, cannot cancel", frozen.statusLock === "FINAL" && frozen.nextStatus === null && frozen.prevStatus === null && frozen.canCancel === false, frozen.statusLock);

  // ------------------------------------------------------------ 7b. returns (sm is Delivered = the final stage)
  const retCall = (method: "POST" | "DELETE", customer: string, body?: unknown) =>
    call(returnRoute[method], { method, params: { storeId: A.store.id, orderId: sm.id }, customer, body });
  check("return: refused while returns are off", (await retCall("POST", C1, { reason: "Damaged" })).body?.error?.code === "RETURNS_OFF");
  await updateOrderSettings(A.store.id, { returns: { enabled: true } });

  const before = parseDetails(sm.id, (await prismadb.order.findUniqueOrThrow({ where: { id: sm.id } })).details);
  const savedDetails = JSON.parse(JSON.stringify(before));
  const aged = parseDetails(sm.id, savedDetails);
  const reached = [...aged.events].reverse().find((e) => e.type === "status" && e.status === "Delivered")!;
  reached.at = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
  await prismadb.order.update({ where: { id: sm.id }, data: { details: aged as unknown as Prisma.InputJsonValue } });
  check("return: refused after the 10-day window", (await retCall("POST", C1, { reason: "Damaged" })).body?.error?.code === "RETURN_WINDOW_CLOSED");
  await prismadb.order.update({ where: { id: sm.id }, data: { details: savedDetails as Prisma.InputJsonValue } });

  const asOther = await retCall("POST", C2, { reason: "Damaged" });
  check("return: another customer cannot return my order -> 404", asOther.status === 404);
  const r1 = await retCall("POST", C1, { reason: "Damaged", note: "Box was open" });
  check("return: customer asks to return a Delivered order", r1.status === 200 && r1.body.order.return?.status === "Requested" && r1.body.order.canReturn === false, r1.body);
  check("return: a second request is refused", (await retCall("POST", C1, { reason: "Damaged" })).body?.error?.code === "RETURN_EXISTS");
  const w = await retCall("DELETE", C1);
  check("return: customer withdraws while Requested", w.status === 200 && w.body.order.return === null && w.body.order.canReturn === true, w.body);
  const r2 = await retCall("POST", C1, { reason: "Wrong item" });
  check("return: asks again (one more return is allowed after one withdrawal)", r2.status === 200);
  check("return: first return was withdrawable (canWithdraw true), the second is not (false)", r1.body.order.return?.canWithdraw === true && r2.body.order.return?.canWithdraw === false, [r1.body.order.return, r2.body.order.return]);
  check("return: the second return cannot be withdrawn even at Requested -> NOT_WITHDRAWABLE", (await retCall("DELETE", C1)).body?.error?.code === "NOT_WITHDRAWABLE");
  check("return: details.returnWithdrawals counts the one withdrawal", parseDetails(sm.id, (await prismadb.order.findUniqueOrThrow({ where: { id: sm.id } })).details).returnWithdrawals === 1);
  check("freeze: an order with a return cannot be moved (STATUS_LOCKED)", (await tryUpdate({ status: "Out for delivery" })) === "STATUS_LOCKED");

  check("return: Requested -> Received refused (one step at a time)", (await tryUpdate({ returnStatus: "Received" })) === "INVALID_TRANSITION");
  check("return: Requested -> Approved allowed", (await tryUpdate({ returnStatus: "Approved" })) === "ok");
  check("return: customer cannot withdraw once Approved", (await retCall("DELETE", C1)).body?.error?.code === "NOT_WITHDRAWABLE");
  const stockBeforeRestock = await stockOf(shirt.id);
  check("return: admin puts the items back into stock", (await tryUpdate({ restock: true })) === "ok" && (await stockOf(shirt.id)) === stockBeforeRestock + 1);
  check("return: restock happens only once", (await tryUpdate({ restock: true })) === "ok" && (await stockOf(shirt.id)) === stockBeforeRestock + 1);
  const afterRestock = parseDetails(sm.id, (await prismadb.order.findUniqueOrThrow({ where: { id: sm.id } })).details);
  check("stock flag: after the return restock stockReserved is false and return.restocked is true (marker)", afterRestock.stockReserved === false && afterRestock.return?.restocked === true);
  check("stock flag: the admin view offers no second restock", (await getAdminOrder(A.store.id, { id: sm.id }))!.return?.canRestock === false);
  check("return: payment is not changed by a return", (await prismadb.order.findUniqueOrThrow({ where: { id: sm.id } })).paymentStatus === "PAID");
  check("return: admin rejects it", (await tryUpdate({ returnStatus: "Rejected" })) === "ok");
  check("return: a rejected return cannot move again", (await tryUpdate({ returnStatus: "Approved" })) === "INVALID_TRANSITION");
  const rejectedView = await call(orderRoute.GET, { params: { storeId: A.store.id, orderId: sm.id }, customer: C1 });
  check("return: customer sees Rejected and no Return button", rejectedView.body.order.return?.rejected === true && rejectedView.body.order.canReturn === false);
  check("cancel: a customer cancel without a reason is refused (reason is asked)", (await call(cancelRoute.POST, { method: "POST", params: { storeId: A.store.id, orderId: o1.id }, customer: C1, body: {} })).body?.error?.code === "VALIDATION");

  // ------------------------------------------------------------ 8. timeline: no lost events, private events stay private
  const PRIVATE = "PRIVATE-NOTE-do-not-show";
  const PUBLIC = "Packed with care";
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0
        ? adminUpdateOrder(A.store.id, { id: sm.id }, OWNER, { comment: `${PRIVATE} ${i}`, customerVisible: false })
        : appendOrderEvent(A.store.id, { id: sm.id }, { type: "comment", message: `${PUBLIC} ${i}`, actor: "admin", customerVisible: true }),
    ),
  );
  await adminUpdateOrder(A.store.id, { id: sm.id }, OWNER, { adminContent: "## Thank you\nYour order is **on the way**." });
  const smRow = await prismadb.order.findUniqueOrThrow({ where: { id: sm.id } });
  const smDetails = parseDetails(sm.id, smRow.details);
  const comments = smDetails.events.filter((e) => e.type === "comment");
  check("timeline: 20 parallel comments, all 20 saved", comments.length === 20, comments.length);
  const mine = await call(orderRoute.GET, { params: { storeId: A.store.id, orderId: sm.id }, customer: C1 });
  const text = JSON.stringify(mine.body);
  check("private: customer order has no private comment", mine.status === 200 && !text.includes(PRIVATE));
  check("private: customer never gets the Notes field", !text.includes("NOTES-secret") && !text.includes("privateNote"));
  check("private: customer order has the public comments", text.includes(PUBLIC));
  check("private: no meta / admin id / stockReserved in the customer JSON", !text.includes("meta") && !text.includes(OWNER) && !text.includes("stockReserved") && !text.includes("adminUserId"));
  check("private: customer sees expected delivery, adminContent and PAID", mine.body.order.expectedDelivery === "2026-11-20" && mine.body.order.adminContent?.includes("on the way") && mine.body.order.paymentStatus === "PAID");
  const mineList = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C1 });
  const listText = JSON.stringify(mineList.body);
  check("private: customer list has no private data", !listText.includes(PRIVATE) && !listText.includes("NOTES-secret") && !listText.includes("events") && !listText.includes("meta"));
  check("private: the admin view does have the private notes", JSON.stringify(await getAdminOrder(A.store.id, { id: sm.id })).includes(PRIVATE));

  // ------------------------------------------------------------ 9. wrong user / wrong store
  const asC2 = await call(orderRoute.GET, { params: { storeId: A.store.id, orderId: o1.id }, customer: C2 });
  check("access: another customer's order -> 404", asC2.status === 404);
  const byNumberC2 = await call(orderRoute.GET, { params: { storeId: A.store.id, orderId: "1" }, customer: C2 });
  check("access: another customer's order by number -> 404", byNumberC2.status === 404);
  const cancelC2 = await call(cancelRoute.POST, { method: "POST", params: { storeId: A.store.id, orderId: o1.id }, customer: C2, body: {} });
  check("access: cancelling another customer's order -> 404", cancelC2.status === 404);
  check("access: still PLACED after that", (await prismadb.order.findUniqueOrThrow({ where: { id: o1.id } })).status === "Placed");
  const wrongStore = await call(orderRoute.GET, { params: { storeId: B.store.id, orderId: o1.id }, customer: C1 });
  check("access: own order through another store's URL -> 404", wrongStore.status === 404);
  const c2list = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C2 });
  check("access: customer list holds only own orders", c2list.body.orders.length === 1 && c2list.body.orders[0].id === c2first.body.order.id);
  check("access: admin read through another store -> null", (await getAdminOrder(B.store.id, { id: o1.id })) === null);
  let crossUpdate = "ok";
  try {
    await adminUpdateOrder(B.store.id, { id: o1.id }, OWNER, { status: "Cancelled" });
  } catch (e) {
    crossUpdate = isOrderError(e) ? e.code : String(e);
  }
  check("access: admin update through another store -> NOT_FOUND", crossUpdate === "NOT_FOUND");
  const me = await call(meRoute.GET, { params: { storeId: A.store.id }, customer: C2 });
  check("access: /customer/me returns only my own profile and addresses", me.body.profile.id === C2 && me.body.addresses.every((a: { id: string }) => a.id !== c1Address));

  // ------------------------------------------------------------ 10. lists, stats, settings, CORS
  const page = await listAdminOrders(A.store.id, { page: 1, pageSize: 2 });
  check("admin list: paginated with counts per status", page.orders.length === 2 && page.totalCount === 5 && page.counts["Cancelled"] === 1 && page.counts["Delivered"] === 1);
  const o1Admin = (await getAdminOrder(A.store.id, { id: o1.id }))!;
  const byNumber = await listAdminOrders(A.store.id, { page: 1, pageSize: 20, q: `#${o1Admin.orderNumber}` });
  check("search: by order number (#N)", byNumber.orders.some((o) => o.id === o1.id) && byNumber.orders.every((o) => o.orderNumber === o1Admin.orderNumber), byNumber.orders.length);
  const byName = await listAdminOrders(A.store.id, { page: 1, pageSize: 20, q: o1Admin.shipTo.name.slice(0, 3).toUpperCase() });
  check("search: by receiver name, any case", byName.orders.some((o) => o.id === o1.id));
  const byNothing = await listAdminOrders(A.store.id, { page: 1, pageSize: 20, q: "zz-no-such-order-zz" });
  check("search: no match -> empty list", byNothing.orders.length === 0 && byNothing.totalCount === 0);
  const stats = await getOrderStats(A.store.id);
  check("stats: revenue = the one PAID order (25.00: placed after the price change)", stats.revenuePaise === 2500 && stats.paidOrders === 1, stats);
  check("stats: COD to collect = 3 open COD orders", stats.codToCollect.count === 3, stats.codToCollect);

  await updateOrderSettings(A.store.id, { checkoutPaymentStep: false, autoEmails: true });
  await updateContact(A.store.id, { phone: "+91 98765 00000", email: "owner@example.com" });
  await age(sm.id);
  const noStep = await checkout(A.store.id, C1, { items: [{ productId: shirt.id, quantity: 1 }], address: { addressId: c1Address } });
  check("settings: payment step off -> order placed with no method (seller agrees later)", noStep.status === 201 && noStep.body.order.payment === "");
  const pub = await call(settingsRoute.GET, { params: { storeId: A.store.id }, secret: null });
  check("settings: public GET hides autoEmails and the email", pub.status === 200 && pub.body.settings.checkoutPaymentStep === false && !("autoEmails" in pub.body.settings) && !JSON.stringify(pub.body).includes("owner@example.com"));

  const evil = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C1, origin: "https://evil.example" });
  const good = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C1, origin: "http://localhost:3001" });
  check("cors: other origins get no Allow-Origin", evil.headers.get("access-control-allow-origin") === null);
  check("cors: the store origin is allowed", good.headers.get("access-control-allow-origin") === "http://localhost:3001");

  // ------------------------------------------------------------ 10b. freeze rules, shared stock flag, withdrawal rules (own store)
  const F = await makeStore("F");
  await updateOrderSettings(F.store.id, { returns: { enabled: true } });
  const fp = await F.product("Frozen thing", "10.00", 100, 20);
  const fOrder = async (customer: string, quantity: number, first = false) => {
    const r = await checkout(F.store.id, customer, { items: [{ productId: fp.id, quantity }], address: newAddress, ...(first ? { contact: contact(customer) } : {}), paymentMethod: "COD" });
    if (r.status !== 201) throw new Error(`fOrder failed ${JSON.stringify(r.body)}`);
    await age(r.body.order.id);
    return r.body.order.id as string;
  };
  const fTry = async (orderId: string, body: Parameters<typeof adminUpdateOrder>[3]) => {
    try {
      await adminUpdateOrder(F.store.id, { id: orderId }, OWNER, body);
      return "ok";
    } catch (e) {
      return isOrderError(e) ? `${e.code}:${e.message}` : String(e);
    }
  };
  const walkToDelivered = async (orderId: string) => {
    for (const st of ["Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"]) if ((await fTry(orderId, { status: st })) !== "ok") throw new Error(`walk failed at ${st}`);
  };
  const fCustomer = `zz_ord_f1_${Date.now()}`;
  createdUsers.push(fCustomer);
  const fRet = (orderId: string, method: "POST" | "DELETE", body?: unknown) =>
    call(returnRoute[method], { method, params: { storeId: F.store.id, orderId }, customer: fCustomer, body });
  const detailsOf = async (id: string) => parseDetails(id, (await prismadb.order.findUniqueOrThrow({ where: { id } })).details);
  const setDetails = (id: string, d: unknown) => prismadb.order.update({ where: { id }, data: { details: d as Prisma.InputJsonValue } });
  const fakeReturn = { status: "Requested", reason: "x", note: null, requestedAt: new Date().toISOString(), restocked: false };

  // freeze messages
  const fz = await fOrder(fCustomer, 1, true);
  await walkToDelivered(fz);
  check("freeze: final stage message", (await fTry(fz, { status: "Out for delivery" })) === "STATUS_LOCKED:This order is complete and can't be moved.");
  check("freeze: STATUS_LOCKED is HTTP 409", new OrderError("STATUS_LOCKED", "x").status === 409);
  check("freeze: no way out of the final stage (cancel refused too)", (await fTry(fz, { status: "Cancelled" })).startsWith("STATUS_LOCKED"));

  // a return exists on an order that is NOT at the final stage (final list changed later): still frozen, with its own message
  const fr = await fOrder(fCustomer, 2);
  const frDetails = await detailsOf(fr);
  frDetails.return = { ...fakeReturn, reason: "Damaged" };
  await setDetails(fr, frDetails);
  check("freeze: an order with a return (not final) -> A return is in progress.", (await fTry(fr, { status: "Confirmed" })) === "STATUS_LOCKED:A return is in progress.");
  const frView = (await getAdminOrder(F.store.id, { id: fr }))!;
  check("freeze: admin view says RETURN, no next/prev, cannot cancel", frView.statusLock === "RETURN" && frView.nextStatus === null && frView.prevStatus === null && frView.canCancel === false);
  check("freeze: the status did not change", (await prismadb.order.findUniqueOrThrow({ where: { id: fr } })).status === "Placed");

  // an old (unlisted) status may still move to a listed one, when not final and without a return
  const old1 = await fOrder(fCustomer, 3);
  await prismadb.order.update({ where: { id: old1 }, data: { status: "Legacy status" } });
  check("freeze: an old unlisted status can move to a listed status (no return, not final)", (await fTry(old1, { status: "Packed" })) === "ok");
  const old2 = await fOrder(fCustomer, 4);
  await prismadb.order.update({ where: { id: old2 }, data: { status: "Legacy status" } });
  const old2Details = await detailsOf(old2);
  old2Details.return = { ...fakeReturn };
  await setDetails(old2, old2Details);
  check("freeze: an old unlisted status WITH a return cannot move", (await fTry(old2, { status: "Packed" })).startsWith("STATUS_LOCKED"));

  // shared stock flag (a): return restock first, then "Restore stock" of a (forced) cancelled order adds nothing
  const sa = await fOrder(fCustomer, 5);
  await walkToDelivered(sa);
  check("stock flag: customer asks for a return", (await fRet(sa, "POST", { reason: "Damaged" })).status === 200);
  const stockA0 = await stockOf(fp.id);
  check("stock flag: return restock adds the 5 items", (await fTry(sa, { restock: true })) === "ok" && (await stockOf(fp.id)) === stockA0 + 5);
  await prismadb.order.update({ where: { id: sa }, data: { status: "Cancelled" } }); // cannot happen through the app; forced to prove the flag
  check("stock flag: then cancel-restore adds nothing (flag already false)", (await fTry(sa, { restoreStock: true })) === "ok" && (await stockOf(fp.id)) === stockA0 + 5);

  // shared stock flag (b): cancel-restore first, then a return restock is refused and adds nothing
  const sb = await fOrder(fCustomer, 6);
  check("stock flag: cancel order", (await fTry(sb, { status: "Cancelled" })) === "ok");
  const stockB0 = await stockOf(fp.id);
  check("stock flag: Restore stock adds the 6 items", (await fTry(sb, { restoreStock: true })) === "ok" && (await stockOf(fp.id)) === stockB0 + 6);
  const sbDetails = await detailsOf(sb);
  sbDetails.return = { ...fakeReturn };
  await setDetails(sb, sbDetails);
  check("stock flag: then a return restock is refused (VALIDATION) and adds nothing", (await fTry(sb, { restock: true })).startsWith("VALIDATION") && (await stockOf(fp.id)) === stockB0 + 6);
  const sbView = (await getAdminOrder(F.store.id, { id: sb }))!;
  check("stock flag: the admin view offers neither button", sbView.canRestoreStock === false && sbView.return?.canRestock === false);

  // shared stock flag (c): 6 parallel restock clicks add once
  const sc = await fOrder(fCustomer, 7);
  await walkToDelivered(sc);
  await fRet(sc, "POST", { reason: "Damaged" });
  const stockC0 = await stockOf(fp.id);
  await Promise.all(Array.from({ length: 6 }, () => fTry(sc, { restock: true })));
  check("stock flag: 6 parallel restock clicks add the stock exactly once", (await stockOf(fp.id)) === stockC0 + 7);

  // withdrawal rules
  const wo = await fOrder(fCustomer, 8);
  await walkToDelivered(wo);
  const w1 = await fRet(wo, "POST", { reason: "Damaged" });
  check("withdraw: first return can be withdrawn (canWithdraw true)", w1.status === 200 && w1.body.order.return.canWithdraw === true);
  check("withdraw: the first withdrawal works", (await fRet(wo, "DELETE")).status === 200);
  const w2 = await fRet(wo, "POST", { reason: "Again" });
  check("withdraw: a second return can be filed after one withdrawal, canWithdraw false", w2.status === 200 && w2.body.order.return.canWithdraw === false);
  check("withdraw: the second return cannot be withdrawn", (await fRet(wo, "DELETE")).body?.error?.code === "NOT_WITHDRAWABLE");
  const woDetails = await detailsOf(wo);
  check("withdraw: still there after the refused withdrawal", woDetails.return?.status === "Requested" && woDetails.returnWithdrawals === 1);
  const wr = await fOrder(fCustomer, 9);
  await walkToDelivered(wr);
  await fRet(wr, "POST", { reason: "Damaged" });
  check("withdraw: restocked -> cannot be withdrawn even at Requested", (await fTry(wr, { restock: true })) === "ok" && (await fRet(wr, "DELETE")).body?.error?.code === "NOT_WITHDRAWABLE");
  check("withdraw: and the customer view says canWithdraw false", (await call(orderRoute.GET, { params: { storeId: F.store.id, orderId: wr }, customer: fCustomer })).body.order.return.canWithdraw === false);
  const raw = JSON.parse(JSON.stringify(woDetails));
  delete raw.returnWithdrawals;
  check("withdraw: old details without returnWithdrawals read as 0", orderDetailsSchema.parse(raw).returnWithdrawals === 0);

  // ------------------------------------------------------------ 10c. duplicate order protection
  const D = await makeStore("D");
  const dp = await D.product("Dup thing", "12.50", 200, 20);
  const dq = await D.product("Dup other", "3.00", 200, 20);
  const dx = `zz_ord_dx_${Date.now()}`;
  const dy = `zz_ord_dy_${Date.now()}`;
  const dz = `zz_ord_dz_${Date.now()}`;
  createdUsers.push(dx, dy, dz);
  const dCart = (qty: number) => ({ items: [{ productId: dp.id, quantity: qty }, { productId: dq.id, quantity: 1 }], address: newAddress, contact: contact("dx"), paymentMethod: "COD" });
  const dCount = () => prismadb.order.count({ where: { storeId: D.store.id } });
  const dupBefore = duplicateOrders.count;
  const dd1 = await checkout(D.store.id, dx, dCart(2));
  const dd2 = await checkout(D.store.id, dx, dCart(2));
  check("duplicate: sequential retry returns the SAME order (201, same id and number)", dd1.status === 201 && dd2.status === 201 && dd1.body.order.id === dd2.body.order.id && dd1.body.order.orderNumber === dd2.body.order.orderNumber, [dd1.body, dd2.body]);
  check("duplicate: one order, one stock decrement", (await dCount()) === 1 && (await stockOf(dp.id)) === 198 && (await stockOf(dq.id)) === 199);
  check("duplicate: same response shape as a fresh order", JSON.stringify(Object.keys(dd2.body.order).sort()) === JSON.stringify(Object.keys(dd1.body.order).sort()) && dd2.body.order.totalPaise === dd1.body.order.totalPaise);
  check("duplicate: the same cart in another item order is still the same order", (await checkout(D.store.id, dx, { ...dCart(2), items: [...dCart(2).items].reverse() })).body.order.id === dd1.body.order.id);
  check("duplicate: only one address was saved for the retries", (await prismadb.address.count({ where: { usersId: dx } })) === 1);
  const dc = await checkout(D.store.id, dx, dCart(3));
  check("duplicate: a different cart (other quantity) creates a new order", dc.status === 201 && dc.body.order.id !== dd1.body.order.id && (await dCount()) === 2 && (await stockOf(dp.id)) === 195);
  const dOther = await checkout(D.store.id, dy, { ...dCart(2), contact: contact("dy") });
  check("duplicate: a different customer with the same cart creates a new order", dOther.status === 201 && dOther.body.order.id !== dd1.body.order.id && (await dCount()) === 3);
  await age(dd1.body.order.id, 61);
  const dOld = await checkout(D.store.id, dx, dCart(2));
  check("duplicate: an order older than 60 s does not count -> new order", dOld.status === 201 && dOld.body.order.id !== dd1.body.order.id && (await dCount()) === 4);
  await adminUpdateOrder(D.store.id, { id: dOld.body.order.id }, OWNER, { status: "Cancelled" });
  const dCancelled = await checkout(D.store.id, dx, dCart(2));
  check("duplicate: a Cancelled order does not count -> new order", dCancelled.status === 201 && dCancelled.body.order.id !== dOld.body.order.id);
  await prismadb.product.update({ where: { id: dp.id }, data: { price: "13.00" } });
  const dPrice = await checkout(D.store.id, dx, dCart(2));
  check("duplicate: same cart but another total (price changed) -> new order", dPrice.status === 201 && dPrice.body.order.id !== dCancelled.body.order.id);

  const stockPre = await stockOf(dp.id);
  const countPre = await dCount();
  const par = await Promise.all(Array.from({ length: 5 }, () => checkout(D.store.id, dz, { ...dCart(4), contact: contact("dz") })));
  const parIds = new Set(par.map((r) => r.body?.order?.id));
  check("duplicate: 5 concurrent identical requests -> all 201 with ONE order id", par.every((r) => r.status === 201) && parIds.size === 1, par.map((r) => r.body));
  check("duplicate: 5 concurrent -> exactly one new order and one stock decrement (4)", (await dCount()) === countPre + 1 && (await stockOf(dp.id)) === stockPre - 4);
  check(`duplicate: the protection answered ${duplicateOrders.count - dupBefore} repeats`, duplicateOrders.count - dupBefore >= 6);

  // ------------------------------------------------------------ 11. every order in the database matches the details schema
  const all = await prismadb.order.findMany({ select: { id: true, details: true } });
  const broken = all.filter((o) => !orderDetailsSchema.safeParse(o.details).success).map((o) => o.id);
  check(`schema: all ${all.length} orders in the database have valid details (incl. backfilled ones)`, broken.length === 0, broken);
}

async function cleanup() {
  if (createdStores.length) {
    await prismadb.$executeRaw`DELETE FROM "CartItem" WHERE "storeId" = ANY(${createdStores})`;
    // Raw SQL in a fixed order (the relations are emulated by Prisma, there are no real foreign keys).
    await prismadb.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "Order" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Product" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Category" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Store" WHERE id = ANY(${createdStores})`;
  }
  await prismadb.$executeRaw`DELETE FROM "Address" WHERE "usersId" = ANY(${createdUsers})`;
  await prismadb.$executeRaw`DELETE FROM "Users" WHERE id = ANY(${createdUsers})`;
}

main()
  .catch((error) => {
    failed++;
    console.error("CRASH", error);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n${passed} passed, ${failed} failed`);
    console.log(failed === 0 ? "ALL PASS" : "FAILED");
    process.exitCode = failed === 0 ? 0 : 1;
    await prismadb.$disconnect();
  });
