/**
 * Proves the order safety rules on the LOCAL database. No Cloudinary, no Stripe, no emails.
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
import { isOrderError } from "@/lib/orders/errors";
import { orderNumberRetries } from "@/lib/orders/create";
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
    data: { name, userId: OWNER, slug: `${TAG}-${name}`.toLowerCase(), orderSettings: settings ?? Prisma.DbNull },
  });
  createdStores.push(store.id);
  const billboard = await prismadb.billboard.create({ data: { storeId: store.id, label: "t" } });
  const category = await prismadb.category.create({ data: { storeId: store.id, billboardId: billboard.id, name: "t", imageUrl: "" } });
  const product = (name: string, price: string, quantity: number, maxQuantity = 10, isArchived = false) =>
    prismadb.product.create({ data: { storeId: store.id, categoryId: category.id, name, price, quantity, maxQuantity, isArchived } });
  return { store, product };
}

const stockOf = async (id: string) => (await prismadb.product.findUniqueOrThrow({ where: { id } })).quantity;
const contact = (n: string) => ({ fname: `Test ${n}`, email: `${n}@example.com`, phone: "+91 98765 43210" });
const newAddress = { new: { value: "12 MG Road, Pune", pincode: "411001", instructions: "Ring bell" } };

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
  check("status: Delivered -> Cancelled refused (final stage)", (await tryUpdate({ status: "Cancelled" })) === "INVALID_TRANSITION");

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
  check("return: asks again", (await retCall("POST", C1, { reason: "Wrong item" })).status === 200);

  check("return: Requested -> Received refused (one step at a time)", (await tryUpdate({ returnStatus: "Received" })) === "INVALID_TRANSITION");
  check("return: Requested -> Approved allowed", (await tryUpdate({ returnStatus: "Approved" })) === "ok");
  check("return: customer cannot withdraw once Approved", (await retCall("DELETE", C1)).body?.error?.code === "NOT_WITHDRAWABLE");
  const stockBeforeRestock = await stockOf(shirt.id);
  check("return: admin puts the items back into stock", (await tryUpdate({ restock: true })) === "ok" && (await stockOf(shirt.id)) === stockBeforeRestock + 1);
  check("return: restock happens only once", (await tryUpdate({ restock: true })) === "ok" && (await stockOf(shirt.id)) === stockBeforeRestock + 1);
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
  const noStep = await checkout(A.store.id, C1, { items: [{ productId: shirt.id, quantity: 1 }], address: { addressId: c1Address } });
  check("settings: payment step off -> order placed with no method (seller agrees later)", noStep.status === 201 && noStep.body.order.payment === "");
  const pub = await call(settingsRoute.GET, { params: { storeId: A.store.id }, secret: null });
  check("settings: public GET hides autoEmails and the email", pub.status === 200 && pub.body.settings.checkoutPaymentStep === false && !("autoEmails" in pub.body.settings) && !JSON.stringify(pub.body).includes("owner@example.com"));

  const evil = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C1, origin: "https://evil.example" });
  const good = await call(ordersRoute.GET, { params: { storeId: A.store.id }, customer: C1, origin: "http://localhost:3001" });
  check("cors: other origins get no Allow-Origin", evil.headers.get("access-control-allow-origin") === null);
  check("cors: the store origin is allowed", good.headers.get("access-control-allow-origin") === "http://localhost:3001");

  // ------------------------------------------------------------ 11. every order in the database matches the details schema
  const all = await prismadb.order.findMany({ select: { id: true, details: true } });
  const broken = all.filter((o) => !orderDetailsSchema.safeParse(o.details).success).map((o) => o.id);
  check(`schema: all ${all.length} orders in the database have valid details (incl. backfilled ones)`, broken.length === 0, broken);
}

async function cleanup() {
  if (createdStores.length) {
    // Raw SQL in a fixed order (the relations are emulated by Prisma, there are no real foreign keys).
    await prismadb.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "Order" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Product" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Category" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Billboard" WHERE "storeId" = ANY(${createdStores})`;
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
