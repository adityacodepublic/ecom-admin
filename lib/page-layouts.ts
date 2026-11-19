import { randomUUID } from "crypto";

import prismadb from "@/lib/prismadb";
import { CURRENT_CATEGORY, PAGES, pageLayoutSchemas, type PageLayout, type PageName } from "@/lib/home-layout";

/**
 * Reading and writing the layout of a store page. The home layout has its own column (homeLayout); the category
 * and product layouts share one JSON column (pageLayouts: { category, product }).
 */

export const isPage = (value: string): value is PageName => (PAGES as readonly string[]).includes(value);

/** The saved layout of a page, or null when none was saved. Not validated (callers parse it). */
export async function readLayout(storeId: string, page: PageName): Promise<unknown | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { homeLayout: true, pageLayouts: true } });
  if (!store) return undefined;
  if (page === "home") return store.homeLayout;
  return (store.pageLayouts as Record<string, unknown> | null)?.[page] ?? null;
}

export type SaveResult = { ok: true; layout: PageLayout } | { ok: false; status: number; body: unknown };

/** Validates and saves a whole layout (owner only). Sections without an id get one. */
export async function saveLayout(storeId: string, userId: string, page: PageName, body: unknown): Promise<SaveResult> {
  const withIds = Array.isArray(body) ? body.map((section) => ({ ...section, id: section?.id || randomUUID() })) : body;
  const parsed = pageLayoutSchemas[page].safeParse(withIds);
  if (!parsed.success) return { ok: false, status: 400, body: { error: "Invalid layout", issues: parsed.error.issues } };
  const layout = parsed.data as PageLayout;

  // Billboards and categories named in sections must belong to this store.
  const billboardIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const s of layout) {
    if (s.type === "carousel") billboardIds.add(s.settings.billboardId);
    if ((s.type === "productList" || s.type === "productGrid") && s.settings.categoryId) categoryIds.add(s.settings.categoryId);
    if (s.type === "custom") {
      for (const q of Object.values(s.settings.data)) {
        if (q.source === "products" && q.categoryId && q.categoryId !== CURRENT_CATEGORY) categoryIds.add(q.categoryId);
      }
    }
  }
  const owned = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  if (!owned) return { ok: false, status: 405, body: "Unauthorized" };
  if (billboardIds.size || categoryIds.size) {
    const [bCount, cCount] = await Promise.all([
      prismadb.billboard.count({ where: { id: { in: Array.from(billboardIds) }, storeId } }),
      prismadb.category.count({ where: { id: { in: Array.from(categoryIds) }, storeId } }),
    ]);
    if (bCount !== billboardIds.size) return { ok: false, status: 400, body: "Billboard not found in this store" };
    if (cCount !== categoryIds.size) return { ok: false, status: 400, body: "Category not found in this store" };
  }

  if (page === "home") {
    await prismadb.store.updateMany({ where: { id: storeId, userId }, data: { homeLayout: layout } });
  } else {
    // One statement, so saving the category page and the product page at the same time cannot overwrite each other.
    await prismadb.$executeRaw`UPDATE "Store" SET "pageLayouts" = jsonb_set(COALESCE("pageLayouts", '{}'::jsonb), ARRAY[${page}]::text[], ${JSON.stringify(layout)}::jsonb), "updatedAt" = now() WHERE "id" = ${storeId} AND "userId" = ${userId}`;
  }
  return { ok: true, layout };
}
