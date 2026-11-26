import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { SLUG_TAKEN_MESSAGE, slugError } from "@/lib/slug";
import { revalidateStoreInfo } from "@/lib/store-revalidate";
import { triggerStorefrontRedeploy } from "@/lib/vercel-domains";

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

  const current = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { slug: true, customDomain: true, customDomainVerified: true } });
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
  revalidateStoreInfo([current.slug, slug]);
  // The storefront's build-time hostname -> slug map (verified domains only) still names the old slug: rebuild it.
  if (current.customDomain && current.customDomainVerified) triggerStorefrontRedeploy(`slug of store ${storeId} with a custom domain changed`);
  return { ok: true, value: { slug, oldSlug: current.slug } } as const;
}
