/**
 * Proves the catalog fixes on the LOCAL database: image/filter-item validation + all-or-nothing PATCH, stock not
 * overwritten (loadedQuantity), archived products hidden from the public but visible to the owner, delete-in-use
 * 409s, revenue aggregation = the old JS reduce, users pagination, orders page cap, signed upload limits.
 * It creates throw-away stores (slug zz-catalog-test-*) and removes everything it created at the end.
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-catalog-fixes.ts
 */
import crypto from "crypto";
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import { toPaise } from "@/lib/money";
import { orderListQuerySchema, revenueByMonth } from "@/lib/orders/queries";
import { signUpload } from "@/lib/cloudinary";
import * as productsRoute from "@/app/api/[storeId]/products/route";
import * as productRoute from "@/app/api/[storeId]/products/[productId]/route";
import * as categoryRoute from "@/app/api/[storeId]/categories/[categoryId]/route";
import * as categoriesRoute from "@/app/api/[storeId]/categories/route";
import * as filterRoute from "@/app/api/[storeId]/filters/[filterId]/route";
import * as usersRoute from "@/app/api/[storeId]/users/route";
import * as storeRoute from "@/app/api/stores/[storeId]/route";

process.env.CLOUDINARY_URL = "cloudinary://key:secret@testcloud";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
}

const TAG = `zz-catalog-test-${Date.now()}`;
const OWNER = "zz-catalog-owner";
const storeIds: string[] = [];
const userIds: string[] = [];

type Res = { status: number; text: string; json: any };
async function run(fn: () => Promise<Response>, asOwner: string | null, storeId: string): Promise<Res> {
  const res = asOwner ? await agentContext.run({ userId: asOwner, storeId }, fn) : await fn();
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, text, json };
}
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  console.log(`Database host: ${new URL(url).host}`);

  const store = await prismadb.store.create({ data: { name: "A", userId: OWNER, slug: `${TAG}-a` } });
  storeIds.push(store.id);
  const S = store.id;
const banner = [{ url: "https://x.test/b1.png", href: "" }, { url: "https://x.test/b2.png", href: "/a" }];
  const category = await prismadb.category.create({ data: { storeId: S, name: "cat", imageUrl: "https://x.test/c.png", banner } });
  const filter = await prismadb.filter.create({ data: { storeId: S, name: `${TAG}-f` } });
  const value = await prismadb.value.create({ data: { filterId: filter.id, unit: "GB", value: "8" } });
  const product = await prismadb.product.create({
    data: {
      storeId: S,
      categoryId: category.id,
      name: "prod",
      price: "10.00",
      quantity: 5,
      maxQuantity: 5,
      images: { create: [{ url: "https://x.test/p1.png", order: 1 }, { url: "https://x.test/p2.png", order: 2 }] },
      filteritems: { create: [{ valueId: value.id }] },
    },
  });

  const goodBody = (over: Record<string, unknown> = {}) => ({
    name: "prod",
    price: 10,
    quantity: 5,
    maxQuantity: 5,
    categoryId: category.id,
    images: [{ url: "https://x.test/p1.png", order: 1 }, { url: "https://x.test/p2.png", order: 2 }],
    filteritems: [{ filterId: filter.id, valueId: value.id }],
    ...over,
  });
  const patchProduct = (body: unknown, id = product.id) =>
    run(() => productRoute.PATCH(req("PATCH", `/api/${S}/products/${id}`, body), { params: Promise.resolve({ productId: id, storeId: S }) }), OWNER, S);
  const snapshot = async () => {
    const p = await prismadb.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: { orderBy: { order: "asc" } }, filteritems: true } });
    return JSON.stringify({ n: p.name, q: p.quantity, price: String(p.price), img: p.images.map((i) => [i.id, i.url, i.order]), fi: p.filteritems.map((f) => f.id) });
  };

  // ------------------------------------------------------------ 1. validation leaves the record untouched
  const before = await snapshot();
  const bad: [string, unknown][] = [
    ["images not an array", goodBody({ name: "CHANGED", images: "https://x.test/a.png" })],
    ["image without url", goodBody({ name: "CHANGED", images: [{ order: 1 }] })],
    ["image url not a web link", goodBody({ name: "CHANGED", images: [{ url: "javascript:alert(1)", order: 1 }] })],
    ["image url empty", goodBody({ name: "CHANGED", images: [{ url: "", order: 1 }] })],
    ["image order not an integer", goodBody({ name: "CHANGED", images: [{ url: "https://x.test/a.png", order: 1.5 }] })],
    ["image order text", goodBody({ name: "CHANGED", images: [{ url: "https://x.test/a.png", order: "1" }] })],
    ["filteritems not an array", goodBody({ name: "CHANGED", filteritems: "x" })],
    ["filteritem without valueId", goodBody({ name: "CHANGED", filteritems: [{ filterId: "f" }] })],
    ["empty images", goodBody({ name: "CHANGED", images: [] })],
  ];
  for (const [label, body] of bad) {
    const r = await patchProduct(body);
    check(`product PATCH ${label} -> 400`, r.status === 400, [r.status, r.text]);
  }
  check("product untouched after all bad PATCHes", (await snapshot()) === before);

  // A database failure in the middle of the writes (order out of Int range) rolls everything back.
  const mid = await patchProduct(goodBody({ name: "CHANGED", images: [{ url: "https://x.test/n.png", order: 2147483647 + 5 }] }));
  check("product PATCH DB failure mid-way -> 500", mid.status === 500, [mid.status, mid.text]);
  check("product untouched after the failed transaction (images not wiped)", (await snapshot()) === before);

  // Concurrent edits take turns: no duplicated images, no lost filter items.
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => patchProduct(goodBody({ name: `concurrent-${i}` }))));
  check("6 concurrent product PATCHes all 200", results.every((r) => r.status === 200), results.map((r) => r.status));
  const afterC = await prismadb.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: true, filteritems: true } });
  check("concurrent PATCH: exactly 2 images and 1 filter item", afterC.images.length === 2 && afterC.filteritems.length === 1, [afterC.images.length, afterC.filteritems.length]);

  const ok = await patchProduct(goodBody({ name: "renamed", images: [{ url: "https://x.test/only.png", order: 1 }], filteritems: [] }));
  const afterOk = await prismadb.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: true, filteritems: true } });
  check("valid PATCH replaces images and filter items", ok.status === 200 && afterOk.name === "renamed" && afterOk.images.length === 1 && afterOk.filteritems.length === 0);
  await patchProduct(goodBody()); // restore 2 images + filter item

  // POST validation (nothing created)
  const countProducts = () => prismadb.product.count({ where: { storeId: S } });
  const n0 = await countProducts();
  const postBad = await run(() => productsRoute.POST(req("POST", `/api/${S}/products`, goodBody({ images: [{ url: "ftp://x" }] })), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  check("product POST bad image -> 400, nothing created", postBad.status === 400 && (await countProducts()) === n0, [postBad.status, postBad.text]);
  const postOk = await run(() => productsRoute.POST(req("POST", `/api/${S}/products`, goodBody({ name: "second", images: [{ url: "https://x.test/s.png" }] })), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  const secondImgs = await prismadb.image.findMany({ where: { productId: postOk.json?.id } });
  check("product POST ok, missing order defaults to position", postOk.status === 200 && secondImgs.length === 1 && secondImgs[0].order === 1, [postOk.status, postOk.text]);
  const second = postOk.json?.id as string;

  // category billboard (banner)
  const patchCat = (body: unknown) =>
    run(() => categoryRoute.PATCH(req("PATCH", `/api/${S}/categories/${category.id}`, body), { params: Promise.resolve({ categoryId: category.id, storeId: S }) }), OWNER, S);
  for (const [label, bad] of [
    ["banner not an array", "nope"],
    ["banner url not a web link", [{ url: "ftp://x.test/a.png" }]],
    ["banner url javascript:", [{ url: "javascript:alert(1)" }]],
    ["banner href not text", [{ url: "https://x.test/a.png", href: 5 }]],
    ["banner over 20 images", Array.from({ length: 21 }, (_, i) => ({ url: `https://x.test/${i}.png` }))],
  ] as [string, unknown][]) {
    const r = await patchCat({ name: "CHANGED", imageUrl: "https://x.test/c.png", banner: bad });
    check(`category PATCH ${label} -> 400`, r.status === 400, [r.status, r.text]);
  }
  const catNow = await prismadb.category.findUniqueOrThrow({ where: { id: category.id } });
  check("category untouched after bad PATCHes", catNow.name === "cat" && JSON.stringify(catNow.banner) === JSON.stringify(banner));
  const catPostBad = await run(() => categoriesRoute.POST(req("POST", `/api/${S}/categories`, { name: "x", imageUrl: "https://x.test/c.png", banner: [{ url: "javascript:1" }] }), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  check("category POST bad banner -> 400", catPostBad.status === 400, [catPostBad.status, catPostBad.text]);

  // ------------------------------------------------------------ 2. stock is not overwritten
  await prismadb.product.update({ where: { id: product.id }, data: { quantity: 2 } }); // sales since the page loaded (loaded 5)
  await patchProduct(goodBody({ name: "edit-name-only", quantity: 5, loadedQuantity: 5 }));
  check("stock kept when quantity equals loadedQuantity", (await prismadb.product.findUniqueOrThrow({ where: { id: product.id } })).quantity === 2);
  await patchProduct(goodBody({ quantity: 9, loadedQuantity: 5 }));
  check("stock written when the user changed it", (await prismadb.product.findUniqueOrThrow({ where: { id: product.id } })).quantity === 9);
  await patchProduct(goodBody({ quantity: 7 }));
  check("stock written as given when loadedQuantity is absent (API clients)", (await prismadb.product.findUniqueOrThrow({ where: { id: product.id } })).quantity === 7);
  const badLoaded = await patchProduct(goodBody({ quantity: 7, loadedQuantity: -1 }));
  check("bad loadedQuantity -> 400", badLoaded.status === 400, [badLoaded.status, badLoaded.text]);

  // ------------------------------------------------------------ 3. archived products are never public
  await prismadb.product.update({ where: { id: second }, data: { isArchived: true } });
  const listPublic = await run(() => productsRoute.GET(req("GET", `/api/${S}/products`), { params: Promise.resolve({ storeId: S }) }), null, S);
  const listPublicArch = await run(() => productsRoute.GET(req("GET", `/api/${S}/products?isArchived=true`), { params: Promise.resolve({ storeId: S }) }), null, S);
  const listOwner = await run(() => productsRoute.GET(req("GET", `/api/${S}/products`), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  const listOwnerArch = await run(() => productsRoute.GET(req("GET", `/api/${S}/products?isArchived=true`), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  const strangerList = await run(() => productsRoute.GET(req("GET", `/api/${S}/products`), { params: Promise.resolve({ storeId: S }) }), "someone-else", S);
  check("public list hides archived", listPublic.status === 200 && listPublic.json.length === 1 && listPublic.json[0].id === product.id, listPublic.json);
  check("public list ignores isArchived=true", listPublicArch.json.length === 1 && listPublicArch.json[0].id === product.id, listPublicArch.json);
  check("a signed-in non-owner is public too", strangerList.json.length === 1);
  check("owner list sees archived", listOwner.json.length === 2);
  check("owner can filter isArchived=true", listOwnerArch.json.length === 1 && listOwnerArch.json[0].id === second);
  const byId = (id: string, who: string | null) => run(() => productRoute.GET(req("GET", `/api/${S}/products/${id}`), { params: Promise.resolve({ productId: id, storeId: S }) }), who, S);
  check("public by-id: archived reads as missing (null)", (await byId(second, null)).json === null);
  check("public by-id: normal product visible", (await byId(product.id, null)).json?.id === product.id);
  check("owner by-id: archived visible", (await byId(second, OWNER)).json?.id === second);

  // ------------------------------------------------------------ 4. delete while in use -> 409
  const user = await prismadb.users.create({ data: { id: `${TAG}-u0`, fname: "U0" } });
  userIds.push(user.id);
  const address = await prismadb.address.create({ data: { usersId: user.id } });
  const mkOrder = (n: number, createdAt: Date, total: string, paymentStatus = "PAID", status = "Placed", usersId = user.id, addressId = address.id) =>
    prismadb.order.create({ data: { storeId: S, orderNumber: n, usersId, addressId, total, details: {}, paymentStatus, status, createdAt } });
  const withItem = await mkOrder(1, new Date("2026-03-10T10:00:00Z"), "10.00");
  await prismadb.orderItem.create({ data: { orderId: withItem.id, productId: product.id, orderQuantity: 1 } });

  const delProduct = await run(() => productRoute.DELETE(req("DELETE", ""), { params: Promise.resolve({ productId: product.id, storeId: S }) }), OWNER, S);
  check("DELETE product in an order -> 409 plain text", delProduct.status === 409 && /Archive it/.test(delProduct.text), [delProduct.status, delProduct.text]);
  const delCat = await run(() => categoryRoute.DELETE(req("DELETE", ""), { params: Promise.resolve({ categoryId: category.id, storeId: S }) }), OWNER, S);
  check("DELETE category with products -> 409 UI hint", delCat.status === 409 && delCat.text === "Make sure you removed all products using this category first.", [delCat.status, delCat.text]);
  const delStore = await run(() => storeRoute.DELETE(req("DELETE", ""), { params: Promise.resolve({ storeId: S }) }), OWNER, S).catch((e) => ({ status: -1, text: String(e), json: null }));
  console.log(`INFO  DELETE store with data (Clerk session is not available in scripts, so this only reports): ${delStore.status} ${delStore.text}`);
  check("everything still exists after the 409s", !!(await prismadb.product.findUnique({ where: { id: product.id } })) && !!(await prismadb.category.findUnique({ where: { id: category.id } })));
  // A filter's values and links cascade, so deleting a filter works (and is not a 409).
  const delFilter = await run(() => filterRoute.DELETE(req("DELETE", ""), { params: Promise.resolve({ filterId: filter.id, storeId: S }) }), OWNER, S);
  check("DELETE filter still works (links cascade)", delFilter.status === 200, [delFilter.status, delFilter.text]);

  // ------------------------------------------------------------ 5. revenue aggregation equals the old reduce
  const IST_MS = 330 * 60 * 1000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const oldImpl = async (storeId: string, year: number) => {
    const rows = await prismadb.order.findMany({
      where: {
        storeId,
        paymentStatus: "PAID",
        status: { not: "Cancelled" },
        createdAt: { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) },
      },
      select: { total: true, createdAt: true },
    });
    const sums = MONTHS.map(() => 0);
    for (const r of rows) sums[new Date(r.createdAt.getTime() + IST_MS).getUTCMonth()] += toPaise(r.total);
    return MONTHS.map((month, i) => ({ month, revenuePaise: sums[i] }));
  };
  let n = 10;
  const cases: [string, string, string, string][] = [
    // createdAt (UTC), total, paymentStatus, status
    ["2025-12-31T18:29:59.999Z", "111.11", "PAID", "Placed"], // still Dec 31 in IST -> outside 2026
    ["2025-12-31T18:30:00.000Z", "100.10", "PAID", "Placed"], // Jan 1 IST -> Jan 2026
    ["2026-01-31T18:29:59.999Z", "5.05", "PAID", "Delivered"], // Jan 31 IST -> Jan
    ["2026-01-31T18:30:00.000Z", "7.07", "PAID", "Placed"], // Feb 1 IST -> Feb
    ["2026-03-15T09:00:00.000Z", "1234.56", "PAID", "Placed"],
    ["2026-03-20T09:00:00.000Z", "0.01", "PAID", "Placed"],
    ["2026-03-21T09:00:00.000Z", "999.00", "PENDING", "Placed"], // not paid
    ["2026-03-22T09:00:00.000Z", "888.00", "PAID", "Cancelled"], // cancelled
    ["2026-12-31T18:29:59.999Z", "42.42", "PAID", "Placed"], // Dec 31 IST -> Dec
    ["2026-12-31T18:30:00.000Z", "99.99", "PAID", "Placed"], // Jan 1 2027 IST -> outside
  ];
  for (const [at, total, ps, st] of cases) await mkOrder(n++, new Date(at), total, ps, st);
  const [fresh, old] = [await revenueByMonth(S, 2026), await oldImpl(S, 2026)];
  check("revenueByMonth (SQL) equals the old JS reduce, IST month edges included", JSON.stringify(fresh) === JSON.stringify(old), { fresh, old });
  const byName = Object.fromEntries(fresh.map((m) => [m.month, m.revenuePaise]));
  check("revenueByMonth expected values", byName.Jan === 10010 + 505 && byName.Feb === 707 && byName.Mar === 123456 + 1 + 1000 /* order #1: 10.00 on 2026-03-10 */ && byName.Dec === 4242 && fresh.length === 12, byName);

  // ------------------------------------------------------------ 6. users pagination
  const made: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const u = await prismadb.users.create({ data: { id: `${TAG}-u${i}`, fname: `U${i}`, createdAt: new Date(Date.UTC(2026, 0, i)) } });
    userIds.push(u.id);
    const a = await prismadb.address.create({ data: { usersId: u.id } });
    await mkOrder(100 + i, new Date("2026-05-01T00:00:00Z"), "1.00", "PAID", "Placed", u.id, a.id);
    made.push(u.id);
  }
  const getUsers = (qs: string) => run(() => usersRoute.GET(req("GET", `/api/${S}/users${qs}`), { params: Promise.resolve({ storeId: S }) }), OWNER, S);
  const p1 = await getUsers("?pageSize=2&page=1");
  const p2 = await getUsers("?pageSize=2&page=2");
  const p3 = await getUsers("?pageSize=2&page=3");
  const ids = [...p1.json.users, ...p2.json.users, ...p3.json.users].map((u: { id: string }) => u.id);
  check("users: 5 customers total, page 1 has 2 and hasMore", p1.json.totalCount === 5 && p1.json.users.length === 2 && p1.json.hasMore === true, p1.json);
  check("users: page 3 has the last one, hasMore false", p3.json.users.length === 1 && p3.json.hasMore === false, p3.json);
  check("users: stable order, no overlap, nobody missing", new Set(ids).size === 5 && ids[0] === `${TAG}-u0`, ids); // u0 was created last
  const def = await getUsers("");
  check("users: defaults page 1, pageSize 50", def.json.page === 1 && def.json.pageSize === 50 && def.json.users.length === 5, def.json);
  check("users: pageSize 101 -> 400", (await getUsers("?pageSize=101")).status === 400);
  check("users: page 0 / text / 100001 -> 400", (await getUsers("?page=0")).status === 400 && (await getUsers("?page=abc")).status === 400 && (await getUsers("?page=100001")).status === 400);
  const noAuth = await run(() => usersRoute.GET(req("GET", `/api/${S}/users`), { params: Promise.resolve({ storeId: S }) }), "someone-else", S);
  check("users: non-owner still refused", noAuth.status === 403, noAuth.status);

  // ------------------------------------------------------------ 7. orders page cap
  check("orders: page 100000 ok", orderListQuerySchema.safeParse({ page: "100000" }).success);
  check("orders: page 100001 rejected", !orderListQuerySchema.safeParse({ page: "100001" }).success);
  check("orders: pageSize 101 rejected", !orderListQuerySchema.safeParse({ pageSize: "101" }).success);

  // ------------------------------------------------------------ 8. signed upload limits
  const s = signUpload(S);
  const expected = crypto
    .createHash("sha1")
    .update(`allowed_formats=jpg,jpeg,png,webp,gif,avif&folder=ecom/${S}&timestamp=${s.timestamp}secret`)
    .digest("hex");
  check("signUpload signs folder, timestamp and allowed_formats", s.signature === expected && s.allowed_formats === "jpg,jpeg,png,webp,gif,avif", s);

  console.log(`\n${passed} passed, ${failed} failed`);
}

async function cleanup() {
  for (const id of storeIds) {
    const orders = await prismadb.order.findMany({ where: { storeId: id }, select: { id: true } });
    await prismadb.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prismadb.order.deleteMany({ where: { storeId: id } });
    await prismadb.product.deleteMany({ where: { storeId: id } });
    await prismadb.category.deleteMany({ where: { storeId: id } });
    await prismadb.filter.deleteMany({ where: { storeId: id } });
    await prismadb.store.deleteMany({ where: { id } });
  }
  await prismadb.address.deleteMany({ where: { usersId: { in: userIds } } });
  await prismadb.users.deleteMany({ where: { id: { in: userIds } } });
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    await prismadb.$disconnect();
    process.exit(failed ? 1 : 0);
  });
