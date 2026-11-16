/**
 * Proves the media delete safety rules. Uses throw-away rows (store slug "zz-media-test-*") and removes
 * them at the end. It never calls Cloudinary: it only runs the decision function.
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-media-safety.ts
 *
 * Checks:
 *  1. two stores share one publicId: deleting in store A must KEEP the file (decision says "referenced")
 *  2. only one row left: the file may be destroyed (decision says null)
 *  3. a url used by a product image: keep the file
 *  4. escapeLike makes % and _ literal in a real ILIKE query
 *  5. store delete + library cleanup in one transaction rolls back when the store delete fails
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { escapeLike } from "../lib/media";
import { fileStillReferenced } from "../lib/media-usage";

const db = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};

async function main() {
  console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host}`);
  const tag = `zz-media-test-${Date.now()}`;
  const mk = (n: string) => db.store.create({ data: { name: n, userId: "zz-test", slug: `${tag}-${n}` } });
  const a = await mk("a");
  const b = await mk("b");
  const created: string[] = [a.id, b.id];
  try {
    // 1 + 2: shared publicId
    const pid = `ecom/${a.id}/shared-test`;
    const rowA = await db.mediaImage.create({ data: { storeId: a.id, url: `https://res.cloudinary.com/x/image/upload/v1/${pid}.png`, publicId: pid, name: "shared.png" } });
    const rowB = await db.mediaImage.create({ data: { storeId: b.id, url: `https://res.cloudinary.com/x/image/upload/v2/${pid}.png`, publicId: pid, name: "shared.png" } });
    check("1. shared publicId in two stores: file is kept", (await fileStillReferenced(db, rowA)) !== null);
    await db.mediaImage.delete({ where: { id: rowB.id } });
    check("2. only one row left: file may be destroyed", (await fileStillReferenced(db, rowA)) === null);

    // 3: url used by a real product image of another store
    const img = await db.image.findFirst({ select: { url: true } });
    if (img) {
      const rowC = await db.mediaImage.create({ data: { storeId: a.id, url: img.url, publicId: "ecom/zz/none", name: "c" } });
      check("3. url used by a product image: file is kept", (await fileStillReferenced(db, rowC)) !== null);
    } else console.log("SKIP  3. no product image in this database");

    // 4: literal % and _
    await db.mediaImage.createMany({
      data: ["50%_off.png", "500x.png", "a_b.png"].map((name, i) => ({ storeId: a.id, url: `https://example.com/t${i}.png`, source: "url", name })),
    });
    const find = async (q: string) =>
      (await db.$queryRaw<{ name: string }[]>(
        Prisma.sql`SELECT "name" FROM "MediaImage" WHERE "storeId" = ${a.id} AND "name" ILIKE ${"%" + escapeLike(q) + "%"} ESCAPE '\\'`,
      )).map((r) => r.name);
    check("4a. search '%' finds only the name with a real %", JSON.stringify(await find("%")) === JSON.stringify(["50%_off.png"]));
    check("4b. search '_' finds only names with a real _", (await find("_")).sort().join() === ["50%_off.png", "a_b.png"].join());

    // 5: transaction rollback. Store b gets a billboard, so deleting the store must fail.
    await db.billboard.create({ data: { storeId: b.id, label: "zz" } });
    await db.mediaImage.create({ data: { storeId: b.id, url: "https://example.com/keep.png", source: "url", name: "keep" } });
    let threw = false;
    try {
      await db.$transaction([
        db.mediaImage.deleteMany({ where: { storeId: b.id, store: { userId: "zz-test" } } }),
        db.store.deleteMany({ where: { id: b.id, userId: "zz-test" } }),
      ]);
    } catch {
      threw = true;
    }
    const left = await db.mediaImage.count({ where: { storeId: b.id } });
    check("5. store delete fails (has a billboard) and library rows are still there", threw && left === 1);
  } finally {
    await db.billboard.deleteMany({ where: { storeId: { in: created } } });
    await db.mediaImage.deleteMany({ where: { storeId: { in: created } } });
    await db.store.deleteMany({ where: { id: { in: created } } });
  }
  console.log(failed ? `${failed} check(s) FAILED` : "All checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main().finally(() => db.$disconnect());
