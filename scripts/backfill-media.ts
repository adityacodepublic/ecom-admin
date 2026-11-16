/**
 * One-time: puts the images the stores already use into the library (MediaImage table):
 * product images, billboard images, category images, and images inside product descriptions.
 * Each store gets its own rows. A row that already exists is left alone, so it is safe to run twice.
 *
 *   npx tsx scripts/backfill-media.ts            # dry run: print what would be added, write nothing
 *   npx tsx scripts/backfill-media.ts --apply    # write it
 *
 * It uses DATABASE_URL from the environment (Prisma reads .env, NOT .env.local, and .env is Neon).
 * For the local database set it in the shell first. The script prints the database host: check it
 * before --apply.
 *
 * Cloudinary links (res.cloudinary.com) become source "upload" with the public id read from the url.
 * If the id cannot be read for sure (a resized link), publicId stays empty: deleting that image then
 * only removes the library row and never a Cloudinary file. Any other link becomes source "url".
 */
import { PrismaClient } from "@prisma/client";

import { nameFromUrl, parsePublicId } from "../lib/media";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const MARKDOWN_IMAGE = /!\[[^\]]*\]\((https:\/\/[^)\s]+)/g;

async function main() {
  let host = "(unknown)";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").host;
  } catch {}
  console.log(`Database host: ${host}`);
  console.log(apply ? "MODE: APPLY (writing)" : "MODE: dry run (nothing is written)");

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  let totalNew = 0;

  for (const store of stores) {
    const urls = new Set<string>();

    const productImages = await prisma.image.findMany({ where: { product: { storeId: store.id } }, select: { url: true } });
    productImages.forEach((i) => urls.add(i.url));

    const billboardImages = await prisma.billboardImage.findMany({
      where: { billboard: { storeId: store.id } },
      select: { url: true },
    });
    billboardImages.forEach((i) => urls.add(i.url));

    const categories = await prisma.category.findMany({ where: { storeId: store.id }, select: { imageUrl: true } });
    categories.forEach((c) => c.imageUrl && urls.add(c.imageUrl));

    const products = await prisma.product.findMany({
      where: { storeId: store.id, description: { not: null } },
      select: { description: true },
    });
    for (const p of products) for (const m of Array.from((p.description ?? "").matchAll(MARKDOWN_IMAGE))) urls.add(m[1]);

    // Only https links (the library accepts nothing else).
    const all = Array.from(urls).filter((u) => /^https:\/\//.test(u) && u.length <= 2000);
    const existing = new Set(
      (await prisma.mediaImage.findMany({ where: { storeId: store.id }, select: { url: true } })).map((m) => m.url),
    );
    const fresh = all.filter((u) => !existing.has(u));

    const rows = fresh.map((url) => {
      const publicId = parsePublicId(url);
      return {
        storeId: store.id,
        url,
        publicId,
        source: publicId ? "upload" : "url",
        name: nameFromUrl(url).slice(0, 200),
      };
    });

    const uploads = rows.filter((r) => r.source === "upload").length;
    console.log(
      `Store "${store.name}" (${store.id}): ${all.length} image links in use, ${existing.size} already in library, ` +
        `${rows.length} to add (${uploads} Cloudinary, ${rows.length - uploads} plain links)`,
    );
    for (const r of rows.slice(0, 5)) console.log(`   e.g. [${r.source}] ${r.name}  ${r.url.slice(0, 90)}`);

    totalNew += rows.length;
    if (apply && rows.length > 0) {
      const res = await prisma.mediaImage.createMany({ data: rows, skipDuplicates: true });
      console.log(`   written: ${res.count}`);
    }
  }

  console.log(apply ? `Done. ${totalNew} rows processed.` : `Dry run done. ${totalNew} rows would be added. Run again with --apply to write.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
