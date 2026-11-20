/**
 * Proves the page layouts (home, category, product) on the LOCAL database: they save and read back in one column
 * without touching each other, fixed blocks are once-only and only on their own page, Billboard and Product list
 * blocks repeat on every page, carousel images are checked, reserved data names, the "current" category,
 * a categoryId from another store, and only the owner can save. Throw-away stores (slug zz-pages-test-*).
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-page-layouts.ts
 */
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import * as route from "@/app/api/[storeId]/page-layouts/[page]/route";
import * as listRoute from "@/app/api/[storeId]/page-layouts/route";
import { precheckPageLayoutsWrite } from "@/lib/page-layouts";
import { CUSTOM_PAGES_MAX, RESERVED_ROUTES } from "@/lib/home-layout";
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
const create = async (storeId: string, owner: string, body: unknown) => {
  const req = new Request("http://localhost:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await agentContext.run({ userId: owner, storeId }, () => listRoute.POST(req, { params: Promise.resolve({ storeId }) }));
  return { status: res.status, text: await res.text() };
};
const del = async (storeId: string, owner: string, page: string) => {
  const res = await agentContext.run({ userId: owner, storeId }, () => route.DELETE(new Request("http://x/x", { method: "DELETE" }), { params: Promise.resolve({ storeId, page }) }));
  return { status: res.status, text: await res.text() };
};
const custom = (settings: Record<string, unknown> = {}) => ({ type: "custom", settings: { html: "<div>hi</div>", ...settings } });
const carousel = (images: unknown[] = [{ url: "https://x.test/b.png", href: "/x" }]) => ({ type: "carousel", settings: { images } });
const list = (settings: Record<string, unknown> = {}) => ({ type: "productList", settings: { title: "Picks", ...settings } });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  const old = (await prismadb.store.findMany({ where: { slug: { startsWith: "zz-pages-test-" } }, select: { id: true } })).map((x) => x.id);
  await prismadb.category.deleteMany({ where: { storeId: { in: old } } });
  await prismadb.store.deleteMany({ where: { id: { in: old } } });
  const a = await prismadb.store.create({ data: { name: "A", userId: "user_zz_a", slug: "zz-pages-test-a" } });
  const b = await prismadb.store.create({ data: { name: "B", userId: "user_zz_b", slug: "zz-pages-test-b" } });
  try {
    const catA = await prismadb.category.create({ data: { storeId: a.id, name: "a", imageUrl: "https://x.test/a.png" } });
    const catB = await prismadb.category.create({ data: { storeId: b.id, name: "c", imageUrl: "https://x.test/c.png" } });
    const A = "user_zz_a";

    // the defaults are valid layouts of their pages
    for (const page of PAGES) check(`default ${page} layout is valid`, pageLayoutSchemas[page].safeParse(defaultLayouts[page]).success);

    check("nothing saved: GET is null on all pages", (await Promise.all(PAGES.map((p) => get(a.id, p)))).every((r) => r.status === 200 && r.body === null));
    check("unknown page: 404", (await get(a.id, "cart")).status === 404 && (await put(a.id, A, "cart", [])).status === 404);

    // category page: fixed blocks + repeated billboards and product lists
    const cat = await put(a.id, A, "category", [carousel(), { type: "categoryBanner", settings: {} }, list({ categoryId: "current" }), carousel(), custom({ title: "Mid" }), list(), { type: "categoryProducts", settings: {} }]);
    check("category layout saves (billboard and product list twice)", cat.status === 200, cat);
    check("ids are added", JSON.parse(cat.text).every((s: any) => !!s.id));
    check("product list defaults: cards, 8 products", JSON.parse(cat.text)[2].settings.grid === false && JSON.parse(cat.text)[2].settings.limit === 8);
    check("category layout reads back", (await get(a.id, "category")).body.length === 7);

    // all three pages share one column without overwriting each other
    const home = await put(a.id, A, "home", [{ type: "categories", settings: {} }, list({ grid: true, columns: 3, limit: 6 })]);
    check("home layout saves into pageLayouts.home", home.status === 200 && ((await prismadb.store.findUnique({ where: { id: a.id } }))?.pageLayouts as any)?.home?.length === 2, home);
    const prod = await put(a.id, A, "product", [{ type: "productTop", settings: {} }, { type: "relatedProducts", settings: {} }]);
    check("product layout saves, related title defaults", prod.status === 200 && JSON.parse(prod.text)[1].settings.title === "Related Items", prod);
    check("category layout still there after saving home and product", (await get(a.id, "category")).body.length === 7);
    const [p1, p2, p3] = await Promise.all([
      put(a.id, A, "category", [{ type: "categoryProducts", settings: {} }]),
      put(a.id, A, "product", [{ type: "productDescription", settings: {} }]),
      put(a.id, A, "home", [carousel()]),
    ]);
    const [g1, g2, g3] = await Promise.all(["category", "product", "home"].map((p) => get(a.id, p)));
    check(
      "saving all three at once keeps all three",
      [p1, p2, p3].every((r) => r.status === 200) && g1.body[0].type === "categoryProducts" && g2.body[0].type === "productDescription" && g3.body[0].type === "carousel",
    );

    // fixed blocks
    const dup = await put(a.id, A, "product", [{ type: "productTop", settings: {} }, { type: "productTop", settings: {} }]);
    check("a fixed block twice is refused", dup.status === 400 && dup.text.includes("fixed block"), dup);
    check("category icons twice on home are refused", (await put(a.id, A, "home", [{ type: "categories", settings: {} }, { type: "categories", settings: {} }])).status === 400);
    check("a fixed block of another page is refused (category billboard on the product page)", (await put(a.id, A, "product", [{ type: "categoryBanner", settings: {} }])).status === 400);
    check("category icons on the category page are refused", (await put(a.id, A, "category", [{ type: "categories", settings: {} }])).status === 400);
    check("the old product grid block is gone", (await put(a.id, A, "home", [{ type: "productGrid", settings: { title: "x" } }])).status === 400);
    check("custom blocks can repeat", (await put(a.id, A, "product", [custom(), custom(), { type: "productTop", settings: {} }])).status === 200);
    check("an empty layout is allowed", (await put(a.id, A, "category", [])).status === 200 && (await get(a.id, "category")).body.length === 0);
    check("not an array is refused", (await put(a.id, A, "category", { type: "categoryBanner" })).status === 400);

    // billboard images
    check("a billboard without images is refused", (await put(a.id, A, "home", [carousel([])])).status === 400);
    check("a billboard image that is not http(s) is refused", (await put(a.id, A, "home", [carousel([{ url: "javascript:alert(1)" }])])).status === 400);
    check("21 billboard images are refused", (await put(a.id, A, "home", [carousel(Array.from({ length: 21 }, (_, i) => ({ url: `https://x.test/${i}.png` })))])).status === 400);
    const hrefDefault = await put(a.id, A, "home", [carousel([{ url: "https://x.test/1.png" }])]);
    check("href defaults to an empty string", hrefDefault.status === 200 && JSON.parse(hrefDefault.text)[0].settings.images[0].href === "", hrefDefault);
    check("the old billboardId is not enough", (await put(a.id, A, "home", [{ type: "carousel", settings: { billboardId: "x" } }])).status === 400);

    // custom data names
    const named = (page: string, name: string) => put(a.id, A, page, [custom({ data: { [name]: { source: "categories" } } })]);
    check('"category" is reserved on the category page', (await named("category", "category")).status === 400);
    check('"product" is reserved on the product page', (await named("product", "product")).status === 400);
    check('"product" is a fine name on the category page', (await named("category", "product")).status === 200);
    check('"category" is a fine name on the home page', (await named("home", "category")).status === 200);

    // "current" category and ownership of ids
    check('custom categoryId "current" needs no category', (await put(a.id, A, "product", [custom({ data: { more: { source: "products", categoryId: "current" } } })])).status === 200);
    check('product list categoryId "current" needs no category', (await put(a.id, A, "product", [list({ categoryId: "current" })])).status === 200);
    check("product list with this store's category saves", (await put(a.id, A, "home", [list({ categoryId: catA.id })])).status === 200);
    const foreign = await put(a.id, A, "category", [custom({ data: { x: { source: "products", categoryId: catB.id } } })]);
    check("a custom query with a category of another store is refused", foreign.status === 400 && foreign.text.includes("Category not found"), foreign);
    const foreignList = await put(a.id, A, "product", [list({ categoryId: catB.id })]);
    check("a product list with a category of another store is refused", foreignList.status === 400 && foreignList.text.includes("Category not found"), foreignList);

    // only the owner
    check("another account cannot save", (await put(a.id, "user_zz_b", "category", [])).status === 405);
    const anon = await agentContext.run({ userId: "", storeId: a.id }, () =>
      route.PUT(new Request("http://x/x", { method: "PUT", body: "[]" }), { params: Promise.resolve({ storeId: a.id, page: "category" }) }),
    );
    check("no account cannot save", anon.status === 403, anon.status);

    // ---- Markdown block
    const md = { type: "markdown", settings: { markdown: "**7 days**" } };
    check("markdown block saves on every page", (await Promise.all(["home", "category", "product"].map((p) => put(a.id, A, p, [md, md])))).every((r) => r.status === 200));
    const emptyMd = await put(a.id, A, "home", [{ type: "markdown", settings: { markdown: "   " } }]);
    check("an empty markdown block is refused", emptyMd.status === 400 && emptyMd.text.includes("Write some text"), emptyMd);

    // ---- custom pages
    await prismadb.store.update({ where: { id: b.id }, data: { pageLayouts: undefined } });
    const B = "user_zz_b";
    check("store with no pageLayouts at all: first create works", (await create(b.id, B, { route: "/Summer-Sale/" })).status === 201);
    check("the route is normalized and listed", JSON.parse(await (await listRoute.GET(new Request("http://x"), { params: Promise.resolve({ storeId: b.id }) })).text()).custom.join() === "summer-sale");
    check("a new custom page is empty", JSON.stringify((await get(b.id, "summer-sale")).body) === "[]");
    const taken = await create(b.id, B, { route: "summer-sale" });
    check("a taken route: 409 with a clear message", taken.status === 409 && taken.text.includes("already a page"), taken);
    for (const r of ["cart", "product", "category", "search", "home", "checkout", "data"]) {
      const res = await create(b.id, B, { route: r });
      check(`reserved route /${r}: 400`, res.status === 400 && res.text.includes("used by the store"), res);
    }
    check("every reserved route is refused", RESERVED_ROUTES.length >= 10);
    for (const r of ["", "a/b", "Hello World", "x".repeat(41), "a--b", "-a", "a.png"]) {
      check(`bad route "${r.slice(0, 12)}": 400`, (await create(b.id, B, { route: r })).status === 400);
    }
    check("unknown field: 400", (await create(b.id, B, { route: "x", title: "y" })).status === 400);
    check("another account cannot create", (await create(b.id, A, { route: "mine" })).status === 405);
    const saved = await put(b.id, B, "summer-sale", [carousel(), list({ categoryId: "current" }), custom(), { type: "markdown", settings: { markdown: "hi" } }]);
    check("custom page saves Billboard, Product list and Custom component", saved.status === 200, saved);
    check("custom page reads back", (await get(b.id, "summer-sale")).body.length === 4);
    const fixed = await put(b.id, B, "summer-sale", [{ type: "categories", settings: {} }]);
    check("fixed blocks are refused on a custom page", fixed.status === 400, fixed);
    check("saving a page that does not exist: 404", (await put(b.id, B, "nope", [])).status === 404);
    check("GET of a page that does not exist: 404", (await get(b.id, "nope")).status === 404);
    check("built-in pages still read null", (await get(b.id, "home")).status === 200);
    await create(b.id, B, { route: "about" });
    await put(b.id, B, "home", [carousel()]);
    check("custom pages and home do not overwrite each other", (await get(b.id, "summer-sale")).body.length === 4 && (await get(b.id, "home")).body.length === 1 && JSON.stringify((await get(b.id, "about")).body) === "[]");
    check("the home page cannot be deleted", (await del(b.id, B, "home")).status === 400);
    check("another account cannot delete", (await del(b.id, A, "about")).status === 405);
    check("delete a custom page", (await del(b.id, B, "about")).status === 200 && (await get(b.id, "about")).status === 404);
    check("delete again: 404", (await del(b.id, B, "about")).status === 404);
    check("the route is free again after delete", (await create(b.id, B, { route: "about" })).status === 201);
    // limit
    for (let i = 0; i < CUSTOM_PAGES_MAX; i++) await create(b.id, B, { route: `p${i}` });
    const over = await create(b.id, B, { route: "one-more" });
    check(`at most ${CUSTOM_PAGES_MAX} custom pages`, over.status === 400 && over.text.includes("at most"), over);
    // two creates of the same route at once: one wins
    await del(b.id, B, "p0");
    await del(b.id, B, "p1");
    const both = await Promise.all([create(b.id, B, { route: "race" }), create(b.id, B, { route: "race" })]);
    check("two creates of the same route at once: one 201, one 409", both.map((r) => r.status).sort().join() === "201,409", both);
    // agent precheck (permission mode refuses at once instead of queueing)
    check("precheck: taken route", (await precheckPageLayoutsWrite(b.id, "POST", ["page-layouts"], { route: "race" }))?.status === 409);
    check("precheck: reserved route", (await precheckPageLayoutsWrite(b.id, "POST", ["page-layouts"], { route: "cart" }))?.status === 400);
    check("precheck: free route passes", (await precheckPageLayoutsWrite(b.id, "POST", ["page-layouts"], { route: "fresh-one" })) === null);
    check("precheck: missing page", (await precheckPageLayoutsWrite(b.id, "PUT", ["page-layouts", "nope"], []))?.status === 404);
    check("precheck: invalid layout", (await precheckPageLayoutsWrite(b.id, "PUT", ["page-layouts", "race"], [{ type: "categories", settings: {} }]))?.status === 400);
    check("precheck: delete home", (await precheckPageLayoutsWrite(b.id, "DELETE", ["page-layouts", "home"], undefined))?.status === 400);
    check("precheck: valid save passes", (await precheckPageLayoutsWrite(b.id, "PUT", ["page-layouts", "race"], [carousel()])) === null);
  } finally {
    await prismadb.category.deleteMany({ where: { storeId: { in: [a.id, b.id] } } });
    await prismadb.store.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
