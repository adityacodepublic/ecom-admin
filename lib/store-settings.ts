import { Prisma } from "@prisma/client";
import { z } from "zod";

import { validateChromeHtml } from "@/lib/chrome-templates";
import { CLARITY_API_TOKEN,CLARITY_API_TOKEN_ERROR, CLARITY_PROJECT_ID, CLARITY_PROJECT_ID_ERROR } from "@/lib/clarity-format";
import prismadb from "@/lib/prismadb";

/**
 * Store.settings (JSON, null = all defaults): { orders, contact, logo, logoOnly, clarityProjectId, clarityApiToken, clarityInsights }.
 *   orders   order settings (lib/orders/settings.ts)
 *   contact  how customers reach the store (lib/contact.ts)
 *   logo     the store's logo/icon url, shown in the store's header and browser tab ("" = the default icon)
 *   logoOnly true: the store's header shows the logo without the name (for a logo that already contains the name)
 *   clarityProjectId  the owner's own Microsoft Clarity project id ("" = no Clarity on this store's pages)
 *   clarityApiToken   the owner's Clarity Data Export token (secret, admin server only: never sent to a browser or the store app)
 *   navbarHtml, footerHtml  the owner's own navbar / footer HTML (lib/chrome-templates.ts; "" = the default)
 *   clarityInsights   the last visitor numbers fetched with that token, and when to ask Clarity again (lib/clarity-insights.ts)
 * Each part is parsed by its own module; this file only reads and writes the parts.
 */
export type SettingsPart =
  | "orders"
  | "contact"
  | "logo"
  | "logoOnly"
  | "clarityProjectId"
  | "clarityApiToken"
  | "clarityInsights"
  | "navbarHtml"
  | "footerHtml"
  | "revalidation";

const asObject = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** One part of the stored settings (unparsed; undefined when not set). */
export const settingsPart = (raw: unknown, part: SettingsPart): unknown => asObject(raw)[part];

/** The stored settings of a store, or null when the store does not exist. */
export async function readSettings(storeId: string): Promise<unknown | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { settings: true } });
  return store ? (store.settings ?? {}) : null;
}

type PartUpdates = Partial<Record<SettingsPart, (current: unknown) => unknown>>;

/**
 * Changes some parts of the settings (and, if given, the store name) together: one row lock, one write, so a save
 * that touches several parts is all or nothing. Each function gets its part's current (unparsed) value and returns
 * the new one; the other parts are left as they are, so saving the order settings and the contact details at the
 * same time is safe. Returns the store as written, or null when it does not exist.
 */
export async function updateStoreSettings(storeId: string, parts: PartUpdates, name?: string): Promise<{ name: string; slug: string; settings: unknown } | null> {
  return prismadb.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ settings: unknown }[]>`SELECT "settings" FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    if (rows.length === 0) return null;
    const patch = Object.fromEntries(Object.entries(parts).map(([part, next]) => [part, next!(settingsPart(rows[0].settings, part as SettingsPart))]));
    const [store] = await tx.$queryRaw<{ name: string; slug: string; settings: unknown }[]>`
      UPDATE "Store" SET "settings" = COALESCE("settings", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
             "name" = COALESCE(${name ?? null}::text, "name"), "updatedAt" = now()
      WHERE id = ${storeId} RETURNING "name", "slug", "settings"`;
    return store;
  });
}

/** Changes one part under a row lock (see updateStoreSettings). Returns the new value, or null when the store does not exist. */
export async function updateSettingsPart<T>(storeId: string, part: SettingsPart, next: (current: unknown) => T): Promise<T | null> {
  const store = await updateStoreSettings(storeId, { [part]: next });
  return store ? (settingsPart(store.settings, part) as T) : null;
}

/** The same read, inside a transaction. */
export async function readSettingsTx(tx: Prisma.TransactionClient, storeId: string): Promise<unknown> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { settings: true } });
  return store?.settings ?? {};
}

// ---- logo

export const logoSchema = z.union([
  z.literal(""),
  z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, "The logo must be an image link (http or https)"),
]);

export const parseLogo = (raw: unknown): string => {
  const r = logoSchema.safeParse(settingsPart(raw, "logo") ?? "");
  return r.success ? r.data : "";
};

/** Header shows only the logo. Only meaningful with a logo; without one the name is always shown. */
export const parseLogoOnly = (raw: unknown): boolean => settingsPart(raw, "logoOnly") === true;

// ---- Microsoft Clarity (the owner's own project: heatmaps, recordings, funnels)

/** A Clarity project id, for example "zg7vtqkayo" (Clarity > Settings > Overview). "" = not connected. It goes into a script URL, so only letters and digits. */
export const clarityProjectIdSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(CLARITY_PROJECT_ID, CLARITY_PROJECT_ID_ERROR),
]);

export const parseClarityProjectId = (raw: unknown): string => {
  const r = clarityProjectIdSchema.safeParse(settingsPart(raw, "clarityProjectId") ?? "");
  return r.success ? r.data : "";
};

/** A Clarity Data Export API token (Clarity > Settings > Data Export). A JWT: letters, digits and . _ - only. "" = none. */
export const clarityApiTokenSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .regex(CLARITY_API_TOKEN, CLARITY_API_TOKEN_ERROR),
]);

export const parseClarityApiToken = (raw: unknown): string => {
  const r = clarityApiTokenSchema.safeParse(settingsPart(raw, "clarityApiToken") ?? "");
  return r.success ? r.data : "";
};

// ---- navbar and footer HTML (lib/chrome-templates.ts)

const parseChromeHtml = (raw: unknown, part: "navbarHtml" | "footerHtml"): string => {
  const value = settingsPart(raw, part);
  return typeof value === "string" && validateChromeHtml(value) === null ? value : "";
};

/** The stored navbar HTML, or "" (not set, or not valid: the store uses its default). */
export const parseNavbarHtml = (raw: unknown): string => parseChromeHtml(raw, "navbarHtml");

/** The stored footer HTML, or "" (not set, or not valid: the store uses its default). */
export const parseFooterHtml = (raw: unknown): string => parseChromeHtml(raw, "footerHtml");
