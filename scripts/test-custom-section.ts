/**
 * Proves saving a custom home-page section on the LOCAL database: valid save, vh units refused, size cap, bad data names,
 * the reserved name, and a categoryId from another store refused. Throw-away stores (slug zz-custom-test-*), removed at the end.
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-custom-section.ts
 */
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import * as route from "@/app/api/[storeId]/home-layout/route";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(extra)}`);
};

const put = async (storeId: string, owner: string, body: unknown) => {
  const req = new Request("http://localhost:3000/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await agentContext.run({ userId: owner, storeId }, () => route.PUT(req, { params: Promise.resolve({ storeId }) }));
  const text = await res.text();
  return { status: res.status, text };
};
const custom = (settings: Record<string, unknown>) => [{ type: "custom", settings: { html: "<div>hi</div>", ...settings } }];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  const old = (await prismadb.store.findMany({ where: { slug: { startsWith: "zz-custom-test-" } }, select: { id: true } })).map((x) => x.id);
  await prismadb.category.deleteMany({ where: { storeId: { in: old } } });
  await prismadb.billboard.deleteMany({ where: { storeId: { in: old } } });
  await prismadb.store.deleteMany({ where: { id: { in: old } } });
  const a = await prismadb.store.create({ data: { name: "A", userId: "user_zz_a", slug: "zz-custom-test-a" } });
  const b = await prismadb.store.create({ data: { name: "B", userId: "user_zz_b", slug: "zz-custom-test-b" } });
  try {
    const bb = await prismadb.billboard.create({ data: { storeId: b.id, label: "bb" } });
    const catB = await prismadb.category.create({ data: { storeId: b.id, billboardId: bb.id, name: "c", imageUrl: "https://x.test/c.png" } });

    const ok = await put(a.id, "user_zz_a", custom({ title: "T", height: 300, data: { deals: { source: "products", search: "under 20000", limit: 8 }, cats: { source: "categories" }, banners: { source: "billboards" } } }));
    check("valid custom section saves", ok.status === 200, ok);
    const saved = JSON.parse(ok.text)[0];
    check("id is added and defaults are filled", !!saved.id && saved.settings.data.deals.featuredOnly === false && saved.settings.height === 300, saved);
    check("it is stored", ((await prismadb.store.findUnique({ where: { id: a.id } }))?.homeLayout as any)?.[0]?.type === "custom");

    check("no data block is fine (defaults to {})", JSON.parse((await put(a.id, "user_zz_a", custom({}))).text)[0].settings.data !== undefined);
    check("height defaults to 400", JSON.parse((await put(a.id, "user_zz_a", custom({}))).text)[0].settings.height === 400);

    for (const unit of ["100vh", "50dvh", "10 svh", "3lvh"]) {
      const r = await put(a.id, "user_zz_a", custom({ html: `<div style="height:${unit}">x</div>` }));
      check(`${unit} is refused`, r.status === 400 && r.text.includes("vh units"), r);
    }
    check("vh in plain words is fine", (await put(a.id, "user_zz_a", custom({ html: "<p>the vhs tape</p>" }))).status === 200);
    check("empty html is refused", (await put(a.id, "user_zz_a", custom({ html: "" }))).status === 400);
    check("html over the cap is refused", (await put(a.id, "user_zz_a", custom({ html: "x".repeat(300_001) }))).status === 400);
    check("height below 80 is refused", (await put(a.id, "user_zz_a", custom({ height: 40 }))).status === 400);
    check("height above 2000 is refused", (await put(a.id, "user_zz_a", custom({ height: 2001 }))).status === 400);

    check('data name "store" is reserved', (await put(a.id, "user_zz_a", custom({ data: { store: { source: "categories" } } }))).status === 400);
    check("data name with a space is refused", (await put(a.id, "user_zz_a", custom({ data: { "my data": { source: "categories" } } }))).status === 400);
    check("unknown source is refused", (await put(a.id, "user_zz_a", custom({ data: { x: { source: "orders" } } }))).status === 400);
    check("limit 51 is refused", (await put(a.id, "user_zz_a", custom({ data: { x: { source: "products", limit: 51 } } }))).status === 400);
    check("limit 50 is fine", (await put(a.id, "user_zz_a", custom({ data: { x: { source: "products", limit: 50 } } }))).status === 200);

    const foreign = await put(a.id, "user_zz_a", custom({ data: { x: { source: "products", categoryId: catB.id } } }));
    check("another store's categoryId is refused", foreign.status === 400 && foreign.text.includes("Category not found"), foreign);
    check("not the owner cannot save", (await put(a.id, "user_zz_b", custom({}))).status >= 400);
    check("other sections still work", (await put(a.id, "user_zz_a", [{ type: "categories", settings: {} }])).status === 200);
  } finally {
    const ids = (await prismadb.store.findMany({ where: { slug: { startsWith: "zz-custom-test-" } }, select: { id: true } })).map((x) => x.id);
    await prismadb.category.deleteMany({ where: { storeId: { in: ids } } });
    await prismadb.billboard.deleteMany({ where: { storeId: { in: ids } } });
    await prismadb.store.deleteMany({ where: { id: { in: ids } } });
    await prismadb.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
