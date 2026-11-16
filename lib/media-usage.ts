import type { PrismaClient } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { MediaUsage } from "@/lib/media";

/**
 * Decides if the Cloudinary FILE behind a library row may be destroyed. It must not be if anything
 * else, in ANY store, still points at it: another library row with the same public id or url,
 * a product image, billboard image, category image, or a product description with the url.
 * (Backfill makes one row per store, so two stores can share one file.)
 * Takes the Prisma client so a script can run it. Returns the reason to keep it, or null if safe.
 */
export async function fileStillReferenced(
  db: Pick<PrismaClient, "mediaImage" | "image" | "billboardImage" | "category" | "product">,
  media: { id: string; url: string; publicId: string | null },
): Promise<string | null> {
  const sameFile = [{ url: media.url }, ...(media.publicId ? [{ publicId: media.publicId }] : [])];
  if (await db.mediaImage.findFirst({ where: { id: { not: media.id }, OR: sameFile }, select: { id: true } }))
    return "another library row uses this file";
  if (await db.image.findFirst({ where: { url: media.url }, select: { id: true } })) return "a product image uses it";
  if (await db.billboardImage.findFirst({ where: { url: media.url }, select: { id: true } }))
    return "a billboard image uses it";
  if (await db.category.findFirst({ where: { imageUrl: media.url }, select: { id: true } }))
    return "a category uses it";
  if (await db.product.findFirst({ where: { description: { contains: media.url } }, select: { id: true } }))
    return "a product description uses it";
  return null;
}

/**
 * Where each image url is used, in THIS store only (product images, billboard images,
 * category image, and product descriptions that contain the url).
 */
export async function getUsage(storeId: string, urls: string[]): Promise<Map<string, MediaUsage[]>> {
  const map = new Map<string, MediaUsage[]>(urls.map((u) => [u, []]));
  if (urls.length === 0) return map;
  const add = (url: string, u: MediaUsage) => {
    const list = map.get(url);
    if (list && !list.some((x) => x.type === u.type && x.id === u.id)) list.push(u);
  };

  const [productImages, billboardImages, categories, products] = await Promise.all([
    prismadb.image.findMany({
      where: { url: { in: urls }, product: { storeId } },
      select: { url: true, product: { select: { id: true, name: true } } },
    }),
    prismadb.billboardImage.findMany({
      where: { url: { in: urls }, billboard: { storeId } },
      select: { url: true, billboard: { select: { id: true, label: true } } },
    }),
    prismadb.category.findMany({
      where: { storeId, imageUrl: { in: urls } },
      select: { id: true, name: true, imageUrl: true },
    }),
    // Descriptions: only products whose text contains at least one of the urls.
    prismadb.product.findMany({
      where: { storeId, OR: urls.map((u) => ({ description: { contains: u } })) },
      select: { id: true, name: true, description: true },
    }),
  ]);

  for (const i of productImages) if (i.product) add(i.url, { type: "product", id: i.product.id, label: i.product.name });
  for (const i of billboardImages)
    if (i.billboard) add(i.url, { type: "billboard", id: i.billboard.id, label: i.billboard.label });
  for (const c of categories) add(c.imageUrl, { type: "category", id: c.id, label: c.name });
  for (const p of products)
    for (const u of urls) if (p.description?.includes(u)) add(u, { type: "description", id: p.id, label: p.name });

  return map;
}
