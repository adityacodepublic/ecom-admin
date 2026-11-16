import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { SLUG_TAKEN_MESSAGE, slugError } from "@/lib/slug";
import { storeAppOrigin } from "@/lib/store-url";

/**
 * Writing a store's slug. The owner's slug is used exactly as typed (lowercased, trimmed): nothing is
 * auto-allocated. Uniqueness is decided by the database: Store.slug has a unique index, every write
 * is a single INSERT or UPDATE, and a clash (P2002) becomes "This URL name is already taken".
 * So when two requests race for one slug, exactly one wins. A pre-check (slug-available) is a hint only.
 */

export const normalizeSlug = (raw: unknown) => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createStore(name: string, userId: string, rawSlug: unknown) {
  const slug = normalizeSlug(rawSlug);
  const invalid = slugError(slug);
  if (invalid) return { ok: false, status: 400, error: invalid } as const;
  try {
    const store = await prismadb.store.create({ data: { name, userId, slug } });
    return { ok: true, value: store } as const;
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, status: 409, error: SLUG_TAKEN_MESSAGE } as const;
    throw error;
  }
}

/** Renames the store's slug. The old slug is simply free afterwards: its links stop working (404). */
export async function changeStoreSlug(storeId: string, userId: string, rawSlug: unknown) {
  const slug = normalizeSlug(rawSlug);
  const invalid = slugError(slug);
  if (invalid) return { ok: false, status: 400, error: invalid } as const;

  const current = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { slug: true } });
  if (!current) return { ok: false, status: 404, error: "Store not found" } as const;
  if (current.slug === slug) return { ok: true, value: { slug, oldSlug: slug } } as const;

  try {
    // updateMany: the owner check is part of the same single UPDATE.
    const { count } = await prismadb.store.updateMany({ where: { id: storeId, userId }, data: { slug } });
    if (count !== 1) return { ok: false, status: 404, error: "Store not found" } as const;
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, status: 409, error: SLUG_TAKEN_MESSAGE } as const;
    throw error;
  }
  await revalidateStoreLookup([current.slug, slug]);
  return { ok: true, value: { slug, oldSlug: current.slug } } as const;
}

/**
 * The store app caches "slug -> store" for 60s (tag store-<slug>). After a rename, drop both tags
 * so the old URL is a 404 and the new one works right away. Best effort: on failure the cache runs out in 60s.
 */
async function revalidateStoreLookup(slugs: string[]) {
  try {
    await fetch(`${storeAppOrigin()}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: slugs.map((s) => `store-${s}`) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    console.error("[STORE_SLUG_REVALIDATE]", error);
  }
}
