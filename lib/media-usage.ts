import { Prisma, type PrismaClient } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { MediaUsage } from "@/lib/media";
import { pageLabels, PAGES, type PageName } from "@/lib/home-layout";
import { customPagesOf } from "@/lib/page-layouts";

/**
 * Decides if the Cloudinary FILE behind a library row may be destroyed. It must not be if anything
 * else, in ANY store, still points at it: another library row with the same public id or url,
 * a product image, a category (thumbnail or billboard), a page block (billboard images, custom HTML),
 * a store logo, or a product description with the url.
 * (Backfill makes one row per store, so two stores can share one file.)
 * Takes the Prisma client so a script can run it. Returns the reason to keep it, or null if safe.
 */
export async function fileStillReferenced(
  db: Pick<PrismaClient, "mediaImage" | "image" | "category" | "product" | "$queryRaw">,
  media: { id: string; url: string; publicId: string | null },
): Promise<string | null> {
  const sameFile = [{ url: media.url }, ...(media.publicId ? [{ publicId: media.publicId }] : [])];
  if (await db.mediaImage.findFirst({ where: { id: { not: media.id }, OR: sameFile }, select: { id: true } }))
    return "another library row uses this file";
  if (await db.image.findFirst({ where: { url: media.url }, select: { id: true } })) return "a product image uses it";
  if (await db.category.findFirst({ where: { imageUrl: media.url }, select: { id: true } }))
    return "a category uses it";
  if (await db.product.findFirst({ where: { description: { contains: media.url } }, select: { id: true } }))
    return "a product description uses it";
  // JSON columns: the url anywhere in the text (a little too eager at worst, which only keeps the file).
  const [json] = await db.$queryRaw<{ banner: boolean; page: boolean; logo: boolean }[]>(Prisma.sql`
    SELECT EXISTS (SELECT 1 FROM "Category" WHERE strpos("banner"::text, ${media.url}) > 0) AS banner,
           EXISTS (SELECT 1 FROM "Store" WHERE strpos("pageLayouts"::text, ${media.url}) > 0) AS page,
           EXISTS (SELECT 1 FROM "Store" WHERE "settings"->>'logo' = ${media.url}) AS logo`);
  if (json?.banner) return "a category billboard uses it";
  if (json?.page) return "a page block uses it";
  if (json?.logo) return "a store logo uses it";
  return null;
}

/**
 * Where each image url is used, in THIS store only (product images, category thumbnails and billboards,
 * page blocks, the logo, and product descriptions that contain the url).
 */
export async function getUsage(storeId: string, urls: string[]): Promise<Map<string, MediaUsage[]>> {
  const map = new Map<string, MediaUsage[]>(urls.map((u) => [u, []]));
  if (urls.length === 0) return map;
  const add = (url: string, u: MediaUsage) => {
    const list = map.get(url);
    if (list && !list.some((x) => x.type === u.type && x.id === u.id)) list.push(u);
  };

  const [productImages, categories, products, store] = await Promise.all([
    prismadb.image.findMany({
      where: { url: { in: urls }, product: { storeId } },
      select: { url: true, product: { select: { id: true, name: true } } },
    }),
    prismadb.category.findMany({ where: { storeId }, select: { id: true, name: true, imageUrl: true, banner: true } }),
    // Descriptions: only products whose text contains at least one of the urls.
    prismadb.product.findMany({
      where: { storeId, OR: urls.map((u) => ({ description: { contains: u } })) },
      select: { id: true, name: true, description: true },
    }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { pageLayouts: true, settings: true } }),
  ]);

  for (const i of productImages) if (i.product) add(i.url, { type: "product", id: i.product.id, label: i.product.name });
  for (const c of categories) {
    if (map.has(c.imageUrl)) add(c.imageUrl, { type: "category", id: c.id, label: c.name });
    const banner = JSON.stringify(c.banner ?? []);
    for (const u of urls) if (banner.includes(JSON.stringify(u).slice(1, -1))) add(u, { type: "categoryBanner", id: c.id, label: c.name });
  }
  for (const p of products)
    for (const u of urls) if (p.description?.includes(u)) add(u, { type: "description", id: p.id, label: p.name });
  const layouts = (store?.pageLayouts ?? {}) as Partial<Record<PageName, unknown>>;
  const pages: [string, string, unknown][] = [
    ...PAGES.map((page): [string, string, unknown] => [page, pageLabels[page], layouts[page]]),
    ...Object.entries(customPagesOf(layouts)).map(([route, blocks]): [string, string, unknown] => [route, `Page /${route}`, blocks]),
  ];
  for (const [id, label, blocks] of pages) {
    const text = JSON.stringify(blocks ?? []);
    for (const u of urls) if (text.includes(JSON.stringify(u).slice(1, -1))) add(u, { type: "page", id, label });
  }
  const logo = (store?.settings as { logo?: unknown } | null)?.logo;
  if (typeof logo === "string" && map.has(logo)) add(logo, { type: "logo", id: storeId, label: "Store logo" });

  return map;
}
