/**
 * Proves the category and product page layouts on the LOCAL database: they save and read back, do not touch each other
 * or the home layout, built-in blocks are once-only, blocks of another page are refused, reserved data names,
 * "current" category, a categoryId from another store, and only the owner can save. Throw-away stores (slug zz-pages-test-*).
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-page-layouts.ts
 */
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import * as route from "@/app/api/[storeId]/page-layouts/[page]/route";
import { defaultLayouts, pageLayoutSchemas, PAGES } from "@/lib/home-layout";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(extra)}`);
};

const put = async (storeId: string, owner: string, page: string, body: unknown) => {
  const req = new Request("http://localhost:3000/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await agentContext.run({ userId: owner, storeId }, () => route.PUT(req, { params: Promise.resolve({ storeId, page }) }));
  return { status: res.status, text: await res.text() };
};
const get = async (storeId: string, page: string) => {
  const res = await route.GET(new Request("http://localhost:3000/x"), { params: Promise.resolve({ storeId, page }) });
  const text = await res.text();
  return { status: res.status, body: res.status === 200 ? JSON.parse(text) : text };
};
const custom = (settings: Record<string, unknown> = {}) => ({ type: "custom", settings: { html: "<div>hi</div>", ...settings } });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  const old = (await prismadb.store.findMany({ where: { slug: { startsWith: "zz-pages-test-" } }, select: { id: true } })).map((x) => x.id);
  await prismadb.category.deleteMany({ where: { storeId: { in: old } } });
  await prismadb.billboard.deleteMany({ where: { storeId: { in: old } } });
  await prismadb.store.deleteMany({ where: { id: { in: old } } });
  const a = await prismadb.store.create({ data: { name: "A", userId: "user_zz_a", slug: "zz-pages-test-a" } });
  const b = await prismadb.store.create({ data: { name: "B", userId: "user_zz_b", slug: "zz-pages-test-b" } });
  try {
    const bb = await prismadb.billboard.create({ data: { storeId: b.id, label: "bb" } });
    const catB = await prismadb.category.create({ data: { storeId: b.id, billboardId: bb.id, name: "c", imageUrl: "https://x.test/c.png" } });
    const A = "user_zz_a";

    // the defaults are valid layouts of their pages
    for (const page of PAGES) check(`default ${page} layout is valid`, pageLayoutSchemas[page].safeParse(defaultLayouts[page]).success);

    check("nothing saved: GET is null", (await get(a.id, "category")).body === null && (await get(a.id, "product")).body === null);
    check("unknown page: 404", (await get(a.id, "cart")).status === 404 && (await put(a.id, A, "cart", [])).status === 404);

    // category page
    const cat = await put(a.id, A, "category", [{ type: "categoryBanner", settings: {} }, custom({ title: "Mid" }), { type: "categoryProducts", settings: {} }]);
    check("category layout saves", cat.status === 200, cat);
    check("ids are added", JSON.parse(cat.text).every((s: any) => !!s.id));
    check("category layout reads back", (await get(a.id, "category")).body.length === 3);
    check("home layout untouched", (await prismadb.store.findUnique({ where: { id: a.id } }))?.homeLayout === null);

    // product page does not overwrite the category page
    const prod = await put(a.id, A, "product", [{ type: "productTop", settings: {} }, { type: "relatedProducts", settings: {} }]);
    check("product layout saves, title defaults", prod.status === 200 && JSON.parse(prod.text)[1].settings.title === "Related Items", prod);
    check("category layout still there after saving product", (await get(a.id, "category")).body.length === 3 && (await get(a.id, "product")).body.length === 2);
    const [p1, p2] = await Promise.all([
      put(a.id, A, "category", [{ type: "categoryProducts", settings: {} }]),
      put(a.id, A, "product", [{ type: "productDescription", settings: {} }]),
    ]);
    check(
      "saving both at once keeps both",
      p1.status === 200 && p2.status === 200 && (await get(a.id, "category")).body[0].type === "categoryProducts" && (await get(a.id, "product")).body[0].type === "productDescription",
    );

    // validation
    check("home block on the category page is refused", (await put(a.id, A, "category", [{ type: "carousel", settings: { billboardId: "x" } }])).status === 400);
    check("category block on the product page is refused", (await put(a.id, A, "product", [{ type: "categoryBanner", settings: {} }])).status === 400);
    const dup = await put(a.id, A, "product", [{ type: "productTop", settings: {} }, { type: "productTop", settings: {} }]);
    check("a built-in block twice is refused", dup.status === 400 && dup.text.includes("can be used once"), dup);
    check("custom blocks can repeat", (await put(a.id, A, "product", [custom(), custom(), { type: "productTop", settings: {} }])).status === 200);
    check("an empty layout is allowed", (await put(a.id, A, "category", [])).status === 200 && (await get(a.id, "category")).body.length === 0);
    check("not an array is refused", (await put(a.id, A, "category", { type: "categoryBanner" })).status === 400);

    // custom data names
    const named = (page: string, name: string) => put(a.id, A, page, [custom({ data: { [name]: { source: "categories" } } })]);
    check('"category" is reserved on the category page', (await named("category", "category")).status === 400);
    check('"product" is reserved on the product page', (await named("product", "product")).status === 400);
    check('"product" is a fine name on the category page', (await named("category", "product")).status === 200);
    check('"category" is a fine name on the home page', (await named("home", "category")).status === 200);

    // "current" category and ownership of ids
    check('categoryId "current" needs no category', (await put(a.id, A, "product", [custom({ data: { more: { source: "products", categoryId: "current" } } })])).status === 200);
    const foreign = await put(a.id, A, "category", [custom({ data: { x: { source: "products", categoryId: catB.id } } })]);
    check("a category of another store is refused", foreign.status === 400 && foreign.text.includes("Category not found"), foreign);

    // only the owner
    check("another account cannot save", (await put(a.id, "user_zz_b", "category", [])).status === 405);
    const anon = await agentContext.run({ userId: "", storeId: a.id }, () =>
      route.PUT(new Request("http://x/x", { method: "PUT", body: "[]" }), { params: Promise.resolve({ storeId: a.id, page: "category" }) }),
    );
    check("no account cannot save", anon.status === 403, anon.status);
  } finally {
    await prismadb.category.deleteMany({ where: { storeId: { in: [a.id, b.id] } } });
    await prismadb.billboard.deleteMany({ where: { storeId: { in: [a.id, b.id] } } });
    await prismadb.store.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
