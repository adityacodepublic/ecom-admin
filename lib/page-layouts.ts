import { randomUUID } from "crypto";

import prismadb from "@/lib/prismadb";
import { CURRENT_CATEGORY, PAGES, pageLayoutSchemas, type PageLayout, type PageName } from "@/lib/home-layout";

/** Reading and writing the layout of a store page. All three live in one JSON column: Store.pageLayouts = { home, category, product }. */

export const isPage = (value: string): value is PageName => (PAGES as readonly string[]).includes(value);

/** The saved layout of a page, null when none was saved, undefined when the store does not exist. Not validated (callers parse it). */
export async function readLayout(storeId: string, page: PageName): Promise<unknown | null | undefined> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { pageLayouts: true } });
  if (!store) return undefined;
  return (store.pageLayouts as Record<string, unknown> | null)?.[page] ?? null;
}

export type SaveResult = { ok: true; layout: PageLayout } | { ok: false; status: number; body: unknown };

/** Validates and saves a whole layout (owner only). Blocks without an id get one. */
export async function saveLayout(storeId: string, userId: string, page: PageName, body: unknown): Promise<SaveResult> {
  const withIds = Array.isArray(body) ? body.map((section) => ({ ...section, id: section?.id || randomUUID() })) : body;
  const parsed = pageLayoutSchemas[page].safeParse(withIds);
  if (!parsed.success) return { ok: false, status: 400, body: { error: "Invalid layout", issues: parsed.error.issues } };
  const layout = parsed.data as PageLayout;

  // Categories named in blocks must belong to this store ("current" = the page's own category).
  const categoryIds = new Set<string>();
  const addCategory = (id?: string) => id && id !== CURRENT_CATEGORY && categoryIds.add(id);
  for (const s of layout) {
    if (s.type === "productList") addCategory(s.settings.categoryId);
    if (s.type === "custom") for (const q of Object.values(s.settings.data)) if (q.source === "products") addCategory(q.categoryId);
  }
  const owned = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  if (!owned) return { ok: false, status: 405, body: "Unauthorized" };
  if (categoryIds.size) {
    const count = await prismadb.category.count({ where: { id: { in: Array.from(categoryIds) }, storeId } });
    if (count !== categoryIds.size) return { ok: false, status: 400, body: "Category not found in this store" };
  }

  // One statement, so saving two pages at the same time cannot overwrite each other.
  await prismadb.$executeRaw`UPDATE "Store" SET "pageLayouts" = jsonb_set(COALESCE("pageLayouts", '{}'::jsonb), ARRAY[${page}]::text[], ${JSON.stringify(layout)}::jsonb), "updatedAt" = now() WHERE "id" = ${storeId} AND "userId" = ${userId}`;
  return { ok: true, layout };
}
