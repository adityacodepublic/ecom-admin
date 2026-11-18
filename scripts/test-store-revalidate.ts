/**
 * Proves the storefront cache refresh (lib/store-revalidate.ts) on the LOCAL database with a fake fetch:
 * one POST <store app>/api/revalidate per successful write with the four tags of THAT store only, nothing for failed
 * writes, a dead/hanging store app never fails or delays a write, stock changes (order, restore) refresh the catalog,
 * and the agent executor gets it for free. Removes everything it created (stores zz-reval-test-*).
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-store-revalidate.ts
 */
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import { executeRequest } from "@/lib/agent/routes";
import { checkoutSchema, createOrder } from "@/lib/orders/create";
import { adminUpdateOrder } from "@/lib/orders/update";
import * as productsRoute from "@/app/api/[storeId]/products/route";
import * as productRoute from "@/app/api/[storeId]/products/[productId]/route";
import * as billboardsRoute from "@/app/api/[storeId]/billboards/route";
import * as categoriesRoute from "@/app/api/[storeId]/categories/route";
import * as filtersRoute from "@/app/api/[storeId]/filters/route";
import * as settingsRoute from "@/app/api/[storeId]/order-settings/route";
import * as contactRoute from "@/app/api/[storeId]/contact/route";

process.env.NEXT_PUBLIC_TENANT_MODE = "path";
process.env.NEXT_PUBLIC_STORE_URL = "http://store.test:3001";

let failed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
}

// ---- fake fetch (only /api/revalidate is faked; anything else goes to the real one)
type Mode = "ok" | "reject" | "hang";
let mode: Mode = "ok";
let calls: { url: string; tags: string[] }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.endsWith("/api/revalidate")) return realFetch(input, init);
  calls.push({ url, tags: JSON.parse(init.body).tag });
  if (mode === "reject") throw new TypeError("fetch failed");
  if (mode === "hang") {
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("timeout"))));
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;
const reset = (m: Mode = "ok") => {
  mode = m;
  calls = [];
};
const tagsOf = (id: string) => ["products", "categories", "billboards", "filters"].map((t) => `${t}-${id}`);
const sameTags = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const TAG = `zz-reval-test-${Date.now()}`;
const OWNER = "zz-reval-owner";
const CUST = `zz_reval_c_${Date.now()}`;
const storeIds: string[] = [];

const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost:3000${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const as = async (fn: () => Promise<Response>, storeId: string, userId = OWNER) => {
  const t0 = Date.now();
  const res = await agentContext.run({ userId, storeId }, fn);
  await res.text();
  return { status: res.status, ms: Date.now() - t0 };
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");

  const mk = async (n: string) => {
    const store = await prismadb.store.create({ data: { name: n, userId: OWNER, slug: `${TAG}-${n}` } });
    storeIds.push(store.id);
    const billboard = await prismadb.billboard.create({ data: { storeId: store.id, label: "b" } });
    const category = await prismadb.category.create({ data: { storeId: store.id, billboardId: billboard.id, name: "c", imageUrl: "" } });
    const product = await prismadb.product.create({ data: { storeId: store.id, categoryId: category.id, name: "p", price: "10.00", quantity: 10, maxQuantity: 10 } });
    return { id: store.id, billboard, category, product };
  };
  const A = await mk("a");
  const B = await mk("b");

  const body = (c: { category: { id: string } }, over: Record<string, unknown> = {}) => ({
    name: "n", price: 5, quantity: 3, maxQuantity: 3, categoryId: c.category.id, images: [{ url: "https://x.test/p.png", order: 1 }], filteritems: [], ...over,
  });
  const postProduct = (S: typeof A, over: Record<string, unknown> = {}, user = OWNER) =>
    as(() => productsRoute.POST(req("POST", `/api/${S.id}/products`, body(S, over)), { params: Promise.resolve({ storeId: S.id }) }), S.id, user);

  // ---- 1. a product write: exactly one POST, four tags, that store only
  reset();
  let r = await postProduct(A);
  check("product POST ok", r.status === 200, r);
  check("product POST -> one POST to <origin>/api/revalidate", calls.length === 1 && calls[0].url === "http://store.test:3001/api/revalidate", calls);
  check("product POST -> the four tags of THAT store only", calls.length === 1 && sameTags(calls[0].tags, tagsOf(A.id)), calls);

  reset();
  r = await as(() => productRoute.PATCH(req("PATCH", `/x`, body(A, { loadedQuantity: 10 })), { params: Promise.resolve({ productId: A.product.id, storeId: A.id }) }), A.id);
  check("product PATCH -> one call for A", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(A.id)), [r, calls]);

  reset();
  r = await as(() => productRoute.DELETE(req("DELETE", `/x`), { params: Promise.resolve({ productId: A.product.id, storeId: A.id }) }), A.id);
  check("product DELETE -> one call for A", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(A.id)), [r, calls]);

  reset();
  r = await as(() => billboardsRoute.POST(req("POST", "/x", { label: "L", images: [{ url: "https://x.test/b.png", order: 1 }] }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("billboard POST -> one call for B (not A)", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(B.id)), [r, calls]);

  reset();
  r = await as(() => categoriesRoute.POST(req("POST", "/x", { name: "C2", billboardId: B.billboard.id, imageUrl: "https://x.test/c.png" }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("category POST -> one call for B", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(B.id)), [r, calls]);

  reset();
  r = await as(() => filtersRoute.POST(req("POST", "/x", { name: `${TAG}-f`, value: [{ value: "8", unit: "GB" }] }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("filter POST -> one call for B", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(B.id)), [r, calls, r]);

  // ---- 2. failed writes trigger nothing
  reset();
  r = await postProduct(B, { name: "" });
  check("validation error -> 400, no call", r.status === 400 && calls.length === 0, [r, calls]);
  r = await postProduct(B, {}, "someone-else");
  check("not the owner -> refused, no call", r.status >= 400 && calls.length === 0, [r, calls]);
  r = await as(() => productRoute.DELETE(req("DELETE", `/x`), { params: Promise.resolve({ productId: A.product.id, storeId: B.id }) }), B.id);
  check("delete of a product of another store -> no call", r.status >= 400 && calls.length === 0, [r, calls]);

  // ---- 3. a broken or hanging store app never fails or slows the write
  const base = await postProduct(B);
  reset("reject");
  r = await postProduct(B);
  check("fetch rejects -> write still 200, fast", r.status === 200 && calls.length === 1 && r.ms < base.ms + 300, [r, base]);
  reset("hang");
  r = await postProduct(B);
  check("fetch hangs -> write still 200, not delayed", r.status === 200 && calls.length === 1 && r.ms < 1500, r);
  reset();

  // ---- 4. not configured -> nothing
  const saved = process.env.NEXT_PUBLIC_STORE_URL;
  delete process.env.NEXT_PUBLIC_STORE_URL;
  r = await postProduct(B);
  check("no NEXT_PUBLIC_STORE_URL -> write ok, no call", r.status === 200 && calls.length === 0, [r, calls]);
  process.env.NEXT_PUBLIC_STORE_URL = saved;

  // subdomain mode uses the root domain
  process.env.NEXT_PUBLIC_TENANT_MODE = "subdomain";
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "shop.test";
  process.env.NEXT_PUBLIC_STORE_PROTOCOL = "http";
  reset();
  await postProduct(B);
  check("subdomain mode -> POST to http://shop.test/api/revalidate", calls.length === 1 && calls[0].url === "http://shop.test/api/revalidate", calls);
  process.env.NEXT_PUBLIC_TENANT_MODE = "path";

  // ---- 5. order settings + contact
  reset();
  r = await as(() => settingsRoute.PATCH(req("PATCH", "/x", { checkoutPaymentStep: true }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("order-settings PATCH -> one call, order-settings tag only", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, [`order-settings-${B.id}`]), [r, calls]);
  reset();
  r = await as(() => contactRoute.PATCH(req("PATCH", "/x", { phone: "+91 98765 43210" }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("contact PATCH -> order-settings tag", r.status === 200 && calls.length === 1 && sameTags(calls[0].tags, [`order-settings-${B.id}`]), [r, calls]);
  reset();
  r = await as(() => settingsRoute.PATCH(req("PATCH", "/x", { bogus: 1 }), { params: Promise.resolve({ storeId: B.id }) }), B.id);
  check("order-settings bad body -> no call", r.status >= 400 && calls.length === 0, [r, calls]);

  // ---- 6. stock changes
  const cart = (productId: string) => checkoutSchema.parse({ items: [{ productId, quantity: 2 }], address: { new: { value: "12 MG Road, Pune", pincode: "411001" } }, contact: { fname: "T", email: "t@example.com", phone: "+91 98765 43210" }, paymentMethod: "COD" });
  const P = await prismadb.product.create({ data: { storeId: A.id, categoryId: A.category.id, name: "stock", price: "10.00", quantity: 50, maxQuantity: 10 } });
  reset();
  const o1 = await createOrder(A.id, CUST, cart(P.id));
  check("order creation -> one call, four tags of that store", calls.length === 1 && sameTags(calls[0].tags, tagsOf(A.id)), calls);
  reset();
  const o2 = await createOrder(A.id, CUST, cart(P.id));
  check("deduplicated repeat order -> same order, no call", o2.id === o1.id && calls.length === 0, [o1.id, o2.id, calls]);
  reset();
  await adminUpdateOrder(A.id, { id: o1.id }, OWNER, { privateNote: "hi" });
  check("admin note only (no stock change) -> no call", calls.length === 0, calls);
  await adminUpdateOrder(A.id, { id: o1.id }, OWNER, { status: "CANCELLED" } as any).catch(() => undefined);
  reset();
  await adminUpdateOrder(A.id, { id: o1.id }, OWNER, { restoreStock: true });
  check("cancelled order + restore stock -> one call", calls.length === 1 && sameTags(calls[0].tags, tagsOf(A.id)), calls);
  reset();
  await adminUpdateOrder(A.id, { id: o1.id }, OWNER, { restoreStock: true });
  check("restore again (already put back) -> no call", calls.length === 0, calls);

  // ---- 7. agent executor (in-process proxy)
  reset();
  const ex = await executeRequest({ userId: OWNER, storeId: B.id, method: "POST", segments: ["products"], query: "", body: body(B) });
  check("agent executor product POST -> 200 and one call for B", ex.status === 200 && calls.length === 1 && sameTags(calls[0].tags, tagsOf(B.id)), [ex.status, calls]);
  reset();
  const exBad = await executeRequest({ userId: OWNER, storeId: B.id, method: "POST", segments: ["products"], query: "", body: body(B, { name: "" }) });
  check("agent executor failed write -> no call", exBad.status === 400 && calls.length === 0, [exBad, calls]);
}

async function cleanup() {
  for (const id of storeIds) {
    const orders = await prismadb.order.findMany({ where: { storeId: id }, select: { id: true } });
    await prismadb.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prismadb.order.deleteMany({ where: { storeId: id } });
    await prismadb.product.deleteMany({ where: { storeId: id } });
    await prismadb.category.deleteMany({ where: { storeId: id } });
    await prismadb.billboard.deleteMany({ where: { storeId: id } });
    await prismadb.filter.deleteMany({ where: { storeId: id } });
    await prismadb.store.deleteMany({ where: { id } });
  }
  await prismadb.address.deleteMany({ where: { usersId: CUST } });
  await prismadb.users.deleteMany({ where: { id: CUST } });
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    await prismadb.$disconnect();
    console.log(failed ? `${failed} FAILED` : "ALL PASSED");
    process.exit(failed ? 1 : 0);
  });
