/**
 * Profiles the checkout path on the LOCAL database: counts the SQL statements and measures the wall time of
 * createOrder for a 1-item and a 10-item order (and a retry that hits the duplicate protection).
 * Creates a throw-away store (slug zz-prof-*) and removes everything at the end.
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/profile-checkout.ts
 *
 * Wall time here is local (no network); on a remote database multiply the statement count by the round-trip time.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const statements: string[] = [];
const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
(client as unknown as { $on: (e: "query", cb: (q: { query: string }) => void) => void }).$on("query", (q) => statements.push(q.query));
(globalThis as { prisma?: PrismaClient }).prisma = client;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  const { createOrder } = await import("@/lib/orders/create");
  const OWNER = "zz-prof-owner";
  const tag = `zz-prof-${Date.now()}`;
  const store = await client.store.create({ data: { name: "prof", userId: OWNER, slug: tag, orderSettings: Prisma.DbNull } });
  const billboard = await client.billboard.create({ data: { storeId: store.id, label: "t" } });
  const category = await client.category.create({ data: { storeId: store.id, billboardId: billboard.id, name: "t", imageUrl: "" } });
  const products = await Promise.all(
    Array.from({ length: 10 }, (_, i) => client.product.create({ data: { storeId: store.id, categoryId: category.id, name: `P${i}`, price: "10.00", quantity: 1000, maxQuantity: 10 } })),
  );
  const customer = `zz_prof_c_${Date.now()}`;
  const contact = { fname: "Prof", email: "prof@example.com", phone: "+91 98765 43210" };
  const address = { new: { value: "12 MG Road, Pune", pincode: "411001", instructions: "" } };

  const run = async (label: string, who: string, items: { productId: string; quantity: number }[], withContact: boolean) => {
    statements.length = 0;
    const t0 = performance.now();
    await createOrder(store.id, who, { items, address, ...(withContact ? { contact } : {}), paymentMethod: "COD" });
    const ms = performance.now() - t0;
    const q = statements.filter((s) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(s)).length;
    const all = statements.length;
    console.log(`${label.padEnd(44)} statements=${String(all).padStart(2)} (${q} + begin/commit)  ${ms.toFixed(0)} ms`);
    return statements.slice();
  };
  const cart = (n: number) => products.slice(0, n).map((p) => ({ productId: p.id, quantity: 1 }));

  await run("warm-up (first connection, first order)", customer, cart(1), true);
  const a = await run("1 item, new address, existing customer", customer, cart(2).slice(1), false);
  const b = await run("10 items, new address, existing customer", customer, cart(10), false);
  const c = await run("1 item again (identical retry within 60 s)", customer, cart(2).slice(1), false);
  if (process.env.SHOW_SQL) for (const s of [...a, "-----", ...b, "-----", ...c]) console.log(s.replace(/\s+/g, " ").slice(0, 150));

  await client.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "storeId" = ${store.id})`;
  await client.$executeRaw`DELETE FROM "Order" WHERE "storeId" = ${store.id}`;
  await client.$executeRaw`DELETE FROM "Product" WHERE "storeId" = ${store.id}`;
  await client.$executeRaw`DELETE FROM "Category" WHERE "storeId" = ${store.id}`;
  await client.$executeRaw`DELETE FROM "Billboard" WHERE "storeId" = ${store.id}`;
  await client.$executeRaw`DELETE FROM "Store" WHERE id = ${store.id}`;
  await client.$executeRaw`DELETE FROM "Address" WHERE "usersId" = ${customer}`;
  await client.$executeRaw`DELETE FROM "Users" WHERE id = ${customer}`;
}

main()
  .catch((e) => {
    console.error("CRASH", e);
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
