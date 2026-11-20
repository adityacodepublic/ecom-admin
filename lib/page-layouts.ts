import { randomUUID } from "crypto";

import prismadb from "@/lib/prismadb";
import {
  CURRENT_CATEGORY,
  CUSTOM_PAGES_MAX,
  PAGES,
  customRouteSchema,
  layoutSchemaFor,
  routeTakenMessage,
  type PageKind,
  type PageLayout,
  type PageName,
} from "@/lib/home-layout";

/**
 * Reading and writing the layouts of the store pages. All live in one JSON column:
 * Store.pageLayouts = { home, category, product, custom: { "<route>": blocks } }.
 * A built-in page always exists (no saved layout = its default). A custom page exists only once created.
 */

export const isPage = (value: string): value is PageName => (PAGES as readonly string[]).includes(value);

const asObject = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** The custom pages in Store.pageLayouts: { route: blocks (unparsed) }. */
export const customPagesOf = (pageLayouts: unknown): Record<string, unknown> => asObject(asObject(pageLayouts).custom);

async function readPageLayouts(storeId: string): Promise<unknown | undefined> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { pageLayouts: true } });
  return store ? (store.pageLayouts ?? {}) : undefined;
}

/**
 * The saved layout of a page (built-in name or custom route). Not validated (callers parse it).
 * undefined: the store does not exist. null: a built-in page with no saved layout. "missing": no custom page at that route.
 */
export async function readLayout(storeId: string, page: string): Promise<unknown | null | undefined | "missing"> {
  const all = await readPageLayouts(storeId);
  if (all === undefined) return undefined;
  if (isPage(page)) return asObject(all)[page] ?? null;
  const custom = customPagesOf(all);
  return Object.prototype.hasOwnProperty.call(custom, page) ? custom[page] : "missing";
}

/** The routes of the store's custom pages, sorted. undefined when the store does not exist. */
export async function listCustomRoutes(storeId: string): Promise<string[] | undefined> {
  const all = await readPageLayouts(storeId);
  return all === undefined ? undefined : Object.keys(customPagesOf(all)).sort();
}

type Fail = { ok: false; status: number; body: unknown };
export type SaveResult = { ok: true; layout: PageLayout } | Fail;

const ownsStore = async (storeId: string, userId: string) =>
  !!(await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } }));

/** Validates a whole layout for a page kind; blocks without an id get one. Categories named in blocks must belong to the store. */
async function checkLayout(storeId: string, kind: PageKind, body: unknown): Promise<{ ok: true; layout: PageLayout } | Fail> {
  const withIds = Array.isArray(body) ? body.map((section) => ({ ...section, id: section?.id || randomUUID() })) : body;
  const parsed = layoutSchemaFor(kind).safeParse(withIds);
  if (!parsed.success) return { ok: false, status: 400, body: { error: "Invalid layout", issues: parsed.error.issues } };
  const layout = parsed.data as PageLayout;

  // "current" = the page's own category (no filter on the home page and custom pages).
  const categoryIds = new Set<string>();
  const addCategory = (id?: string) => id && id !== CURRENT_CATEGORY && categoryIds.add(id);
  for (const s of layout) {
    if (s.type === "productList") addCategory(s.settings.categoryId);
    if (s.type === "custom") for (const q of Object.values(s.settings.data)) if (q.source === "products") addCategory(q.categoryId);
  }
  if (categoryIds.size) {
    const count = await prismadb.category.count({ where: { id: { in: Array.from(categoryIds) }, storeId } });
    if (count !== categoryIds.size) return { ok: false, status: 400, body: "Category not found in this store" };
  }
  return { ok: true, layout };
}

const noPage = (route: string): Fail => ({ ok: false, status: 404, body: `No page at /${route}. Create it first with POST page-layouts { "route": "${route}" }.` });

/** Validates and saves a whole layout (owner only): a built-in page by name, or an existing custom page by route. */
export async function saveLayout(storeId: string, userId: string, page: string, body: unknown): Promise<SaveResult> {
  if (!(await ownsStore(storeId, userId))) return { ok: false, status: 405, body: "Unauthorized" };
  const checked = await checkLayout(storeId, isPage(page) ? page : "custom", body);
  if (!checked.ok) return checked;
  const json = JSON.stringify(checked.layout);

  // One statement each, so saving two pages at the same time cannot overwrite each other.
  if (isPage(page)) {
    await prismadb.$executeRaw`UPDATE "Store" SET "pageLayouts" = jsonb_set(COALESCE("pageLayouts", '{}'::jsonb), ARRAY[${page}]::text[], ${json}::jsonb), "updatedAt" = now() WHERE "id" = ${storeId} AND "userId" = ${userId}`;
    return { ok: true, layout: checked.layout };
  }
  const updated = await prismadb.$executeRaw`UPDATE "Store" SET "pageLayouts" = jsonb_set("pageLayouts", ARRAY['custom', ${page}]::text[], ${json}::jsonb), "updatedAt" = now() WHERE "id" = ${storeId} AND "userId" = ${userId} AND "pageLayouts"->'custom'->${page} IS NOT NULL`;
  return updated ? { ok: true, layout: checked.layout } : noPage(page);
}

/**
 * Why a new custom page cannot be created at this route (format, reserved, taken, too many pages), or the
 * normalized route. Used by the create call and, for agents waiting on approval, before the request is queued.
 */
export async function checkNewRoute(storeId: string, body: unknown): Promise<{ ok: true; route: string } | Fail> {
  const raw = asObject(body);
  const extra = Object.keys(raw).filter((k) => k !== "route");
  if (extra.length) return { ok: false, status: 400, body: `Unknown field "${extra[0]}". Send { "route": "summer-sale" }.` };
  const parsed = customRouteSchema.safeParse(raw.route ?? "");
  if (!parsed.success) return { ok: false, status: 400, body: parsed.error.issues[0]?.message ?? "Invalid route" };
  const route = parsed.data;
  const routes = await listCustomRoutes(storeId);
  if (routes === undefined) return { ok: false, status: 404, body: "Store not found" };
  if (routes.includes(route)) return { ok: false, status: 409, body: routeTakenMessage(route) };
  if (routes.length >= CUSTOM_PAGES_MAX) return { ok: false, status: 400, body: `A store can have ${CUSTOM_PAGES_MAX} custom pages at most. Delete one first.` };
  return { ok: true, route };
}

/** Creates an empty custom page (owner only). */
export async function createCustomPage(storeId: string, userId: string, body: unknown): Promise<{ ok: true; route: string } | Fail> {
  if (!(await ownsStore(storeId, userId))) return { ok: false, status: 405, body: "Unauthorized" };
  const checked = await checkNewRoute(storeId, body);
  if (!checked.ok) return checked;
  const { route } = checked;
  // Atomic: adds the page only while the route is still free and the store is under the limit (two creates at once).
  const created = await prismadb.$executeRaw`
    UPDATE "Store"
    SET "pageLayouts" = jsonb_set(COALESCE("pageLayouts", '{}'::jsonb), '{custom}',
          COALESCE("pageLayouts"->'custom', '{}'::jsonb) || jsonb_build_object(${route}::text, '[]'::jsonb)),
        "updatedAt" = now()
    WHERE "id" = ${storeId} AND "userId" = ${userId}
      AND ("pageLayouts"->'custom'->${route}) IS NULL
      AND (SELECT count(*) FROM jsonb_object_keys(COALESCE("pageLayouts"->'custom', '{}'::jsonb))) < ${CUSTOM_PAGES_MAX}`;
  if (!created) return { ok: false, status: 409, body: routeTakenMessage(route) };
  return { ok: true, route };
}

/** Deletes a custom page and its blocks (owner only). */
export async function deleteCustomPage(storeId: string, userId: string, route: string): Promise<{ ok: true } | Fail> {
  if (!(await ownsStore(storeId, userId))) return { ok: false, status: 405, body: "Unauthorized" };
  const deleted = await prismadb.$executeRaw`UPDATE "Store" SET "pageLayouts" = "pageLayouts" #- ARRAY['custom', ${route}]::text[], "updatedAt" = now() WHERE "id" = ${storeId} AND "userId" = ${userId} AND "pageLayouts"->'custom'->${route} IS NOT NULL`;
  return deleted ? { ok: true } : { ok: false, status: 404, body: `No page at /${route}.` };
}

/**
 * For agents whose writes wait for the owner: the problems that would make a page-layouts write fail are
 * reported at once (taken or reserved route, missing page, invalid layout) instead of after the approval.
 */
export async function precheckPageLayoutsWrite(storeId: string, method: string, segments: string[], body: unknown): Promise<{ status: number; error: string } | null> {
  const asError = (f: Fail) => ({ status: f.status, error: typeof f.body === "string" ? f.body : JSON.stringify(f.body) });
  if (segments.length === 1 && method === "POST") {
    const checked = await checkNewRoute(storeId, body);
    return checked.ok ? null : asError(checked);
  }
  if (segments.length !== 2 || segments[1] === "data") return null;
  const page = segments[1];
  if (method === "DELETE" && isPage(page)) return { status: 400, error: `The ${page} page cannot be deleted. Save an empty layout instead.` };
  if (!isPage(page) && (method === "PUT" || method === "DELETE") && (await readLayout(storeId, page)) === "missing") return asError(noPage(page));
  if (method === "PUT") {
    const checked = await checkLayout(storeId, isPage(page) ? page : "custom", body);
    return checked.ok ? null : asError(checked);
  }
  return null;
}
