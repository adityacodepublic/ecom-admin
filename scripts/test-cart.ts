/**
 * Proves the saved-cart rules (lib/cart.ts) through the real route handlers, on the LOCAL database.
 * Creates throw-away stores (slug zz-cart-test-*) and removes everything it created at the end.
 *
 *   npx tsx --env-file=.env.local scripts/test-cart.ts
 */
import prismadb from "@/lib/prismadb";
import { CART_MAX_LINES } from "@/lib/cart";
import * as cartRoute from "@/app/api/[storeId]/customer/cart/route";

const SECRET = "test-secret-0123456789-0123456789-abcdef";
process.env.STORE_API_SECRET = SECRET;

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
}

const TAG = `zz-cart-test-${Date.now()}`;
const C1 = `zz_cart_c1_${Date.now()}`;
const C2 = `zz_cart_c2_${Date.now()}`;
const createdStores: string[] = [];

type Res = { status: number; body: any };
async function call(method: "GET" | "PATCH", storeId: string, opts: { customer?: string | null; secret?: string | null; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  if (secret !== null) headers["x-store-secret"] = secret;
  if (opts.customer) headers["x-customer-id"] = opts.customer;
  const req = new Request("http://localhost/api/x/customer/cart", {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
  const handler = method === "GET" ? cartRoute.GET : cartRoute.PATCH;
  const res = await handler(req, { params: Promise.resolve({ storeId }) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const get = (storeId: string, customer = C1) => call("GET", storeId, { customer });
const save = (storeId: string, changes: { productId: string; quantity: number }[], merge?: boolean, customer = C1) =>
  call("PATCH", storeId, { customer, body: merge === undefined ? { changes } : { changes, merge } });
const lines = (r: Res) => (r.body?.items ?? []).map((i: any) => `${i.name}:${i.orderQuantity}`).join(",");

async function makeStore(name: string) {
  const store = await prismadb.store.create({ data: { name, userId: "zz-cart-owner", slug: `${TAG}-${name}`.toLowerCase() } });
  createdStores.push(store.id);
  const category = await prismadb.category.create({ data: { storeId: store.id, name: "t", imageUrl: "" } });
  const product = (name: string, quantity: number, maxQuantity = 10, isArchived = false) =>
    prismadb.product.create({ data: { storeId: store.id, categoryId: category.id, name, price: "19.99", quantity, maxQuantity, isArchived } });
  return { store, product };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");

  const A = await makeStore("A");
  const B = await makeStore("B");
  const shirt = await A.product("Shirt", 50, 5);
  const mug = await A.product("Mug", 3, 10);
  const cap = await A.product("Cap", 20, 10);
  const archived = await A.product("Old", 10, 10, true);
  const bItem = await B.product("BItem", 10, 10);
  await prismadb.image.create({ data: { productId: shirt.id, url: "https://example.com/s.jpg", order: 1 } });
  const a = A.store.id;

  // ---------------------------------------------------------------- auth
  check("auth: no secret -> 401", (await call("GET", a, { customer: C1, secret: null })).status === 401);
  check("auth: wrong secret -> 401", (await call("GET", a, { customer: C1, secret: "x".repeat(40) })).status === 401);
  check("auth: no customer -> 401", (await call("GET", a, { customer: null })).status === 401);

  // ---------------------------------------------------------------- empty, validation
  const empty = await get(a);
  check("empty cart -> 200, no items", empty.status === 200 && Array.isArray(empty.body.items) && empty.body.items.length === 0, empty.body);
  check("bad body (quantity -1) -> 400", (await save(a, [{ productId: shirt.id, quantity: -1 }])).status === 400);
  check("bad body (not JSON) -> 400", (await call("PATCH", a, { customer: C1, body: "{nope" })).status === 400);
  check("bad body (extra field) -> 400", (await call("PATCH", a, { customer: C1, body: { changes: [], x: 1 } })).status === 400);

  // ---------------------------------------------------------------- set, order, shape
  let r = await save(a, [{ productId: shirt.id, quantity: 2 }, { productId: mug.id, quantity: 1 }]);
  check("set: 2 lines, in the order sent", r.status === 200 && lines(r) === "Shirt:2,Mug:1", r.body);
  const line = r.body.items[0];
  check(
    "shape: the store's cart line fields",
    line.id === shirt.id && line.price === "19.99" && line.maxQuantity === 5 && line.quantity === 50 &&
      line.images?.[0]?.url === "https://example.com/s.jpg" && line.category?.name === "t" && Array.isArray(line.filteritems) &&
      line.isArchived === false,
    line,
  );
  r = await save(a, [{ productId: cap.id, quantity: 1 }]);
  check("set: a new line goes last", lines(r) === "Shirt:2,Mug:1,Cap:1", r.body);
  r = await save(a, [{ productId: shirt.id, quantity: 4 }]);
  check("set: a change replaces the quantity (not +)", lines(r) === "Shirt:4,Mug:1,Cap:1", r.body);
  r = await save(a, [{ productId: shirt.id, quantity: 4 }]);
  check("set: the same request twice gives the same cart", lines(r) === "Shirt:4,Mug:1,Cap:1", r.body);
  r = await save(a, [{ productId: cap.id, quantity: 3 }, { productId: cap.id, quantity: 2 }]);
  check("set: the last change of a product wins", lines(r) === "Shirt:4,Mug:1,Cap:2", r.body);
  r = await save(a, [{ productId: cap.id, quantity: 0 }]);
  check("remove: quantity 0 removes the line", lines(r) === "Shirt:4,Mug:1", r.body);
  r = await save(a, [{ productId: cap.id, quantity: 0 }]);
  check("remove: removing a missing line is fine", r.status === 200 && lines(r) === "Shirt:4,Mug:1", r.body);

  // ---------------------------------------------------------------- limits and other stores
  r = await save(a, [{ productId: shirt.id, quantity: 9 }]);
  check("limit: above the per-customer limit is lowered (5)", lines(r) === "Shirt:5,Mug:1", r.body);
  check("limit: the saved row is lowered too", (await prismadb.cartItem.findFirst({ where: { customerId: C1, productId: shirt.id } }))?.quantity === 5);
  r = await save(a, [{ productId: mug.id, quantity: 8 }]);
  check("limit: above the stock is lowered (3)", lines(r) === "Shirt:5,Mug:3", r.body);
  r = await save(a, [{ productId: bItem.id, quantity: 1 }, { productId: archived.id, quantity: 1 }, { productId: "nope", quantity: 1 }]);
  check("ignored: another store's, archived and unknown products", lines(r) === "Shirt:5,Mug:3", r.body);
  check("ignored: no rows were written for them", (await prismadb.cartItem.count({ where: { customerId: C1 } })) === 2);
  check("stores: store B's cart is separate", (await get(B.store.id)).body.items.length === 0);
  check("customers: another customer's cart is separate", (await get(a, C2)).body.items.length === 0);

  // ---------------------------------------------------------------- merge (sign-in)
  r = await save(a, [{ productId: shirt.id, quantity: 2 }, { productId: cap.id, quantity: 4 }], true);
  check("merge: keeps the larger quantity, adds new lines", lines(r) === "Shirt:5,Mug:3,Cap:4", r.body);
  r = await save(a, [{ productId: cap.id, quantity: 6 }], true);
  check("merge: a larger browser quantity wins", lines(r) === "Shirt:5,Mug:3,Cap:6", r.body);

  // ---------------------------------------------------------------- products that change
  await prismadb.product.update({ where: { id: mug.id }, data: { quantity: 0 } });
  r = await get(a);
  check("out of stock: still in the cart, with stock 0", lines(r) === "Shirt:5,Mug:3,Cap:6" && r.body.items[1].quantity === 0, r.body);
  check("out of stock: row kept", (await prismadb.cartItem.count({ where: { customerId: C1, productId: mug.id } })) === 1);
  await prismadb.product.update({ where: { id: mug.id }, data: { quantity: 2 } });
  r = await get(a);
  check("restocked: back, lowered to the new stock", lines(r) === "Shirt:5,Mug:2,Cap:6", r.body);
  await prismadb.product.update({ where: { id: cap.id }, data: { isArchived: true } });
  r = await get(a);
  check("archived: removed", lines(r) === "Shirt:5,Mug:2", r.body);
  check("archived: row deleted", (await prismadb.cartItem.count({ where: { customerId: C1, productId: cap.id } })) === 0);
  await prismadb.cartItem.create({ data: { storeId: a, customerId: C1, productId: "deleted-product", quantity: 1 } });
  r = await get(a);
  check("deleted product: removed, row deleted", lines(r) === "Shirt:5,Mug:2" && (await prismadb.cartItem.count({ where: { customerId: C1, productId: "deleted-product" } })) === 0, r.body);

  // ---------------------------------------------------------------- two devices at once
  const many = await Promise.all(Array.from({ length: 6 }, (_, i) => save(a, [{ productId: shirt.id, quantity: 1 + (i % 3) }], false, C2)));
  check("parallel saves: all succeed", many.every((m) => m.status === 200), many.map((m) => m.status));
  check("parallel saves: one row only", (await prismadb.cartItem.count({ where: { customerId: C2, productId: shirt.id } })) === 1);

  // ---------------------------------------------------------------- the line limit
  const extra = await Promise.all(Array.from({ length: CART_MAX_LINES }, (_, i) => A.product(`P${i}`, 10, 10)));
  r = await save(a, extra.map((p) => ({ productId: p.id, quantity: 1 })), false, C2);
  check(`limit: more than ${CART_MAX_LINES} lines -> 400`, r.status === 400 && /up to 100/.test(r.body?.error?.message ?? ""), r.body);
  check("limit: nothing was saved", (await prismadb.cartItem.count({ where: { customerId: C2 } })) === 1);
}

async function cleanup() {
  await prismadb.cartItem.deleteMany({ where: { storeId: { in: createdStores } } });
  await prismadb.cartItem.deleteMany({ where: { customerId: { in: [C1, C2] } } });
  for (const id of createdStores) {
    await prismadb.image.deleteMany({ where: { product: { storeId: id } } });
    await prismadb.product.deleteMany({ where: { storeId: id } });
    await prismadb.category.deleteMany({ where: { storeId: id } });
    await prismadb.store.delete({ where: { id } });
  }
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
