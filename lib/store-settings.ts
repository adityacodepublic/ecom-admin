import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";

/**
 * Store.settings (JSON, null = all defaults): { orders, contact, logo, logoOnly }.
 *   orders   order settings (lib/orders/settings.ts)
 *   contact  how customers reach the store (lib/contact.ts)
 *   logo     the store's logo/icon url, shown in the store's header and browser tab ("" = the default icon)
 *   logoOnly true: the store's header shows the logo without the name (for a logo that already contains the name)
 * Each part is parsed by its own module; this file only reads and writes the parts.
 */
export type SettingsPart = "orders" | "contact" | "logo" | "logoOnly";

const asObject = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** One part of the stored settings (unparsed; undefined when not set). */
export const settingsPart = (raw: unknown, part: SettingsPart): unknown => asObject(raw)[part];

/** The stored settings of a store, or null when the store does not exist. */
export async function readSettings(storeId: string): Promise<unknown | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { settings: true } });
  return store ? (store.settings ?? {}) : null;
}

/**
 * Changes one part under a row lock: `next` gets the current (unparsed) part and returns the new one.
 * Only that part is written, so saving the order settings and the contact details at the same time is safe.
 * Null when the store does not exist.
 */
export async function updateSettingsPart<T>(storeId: string, part: SettingsPart, next: (current: unknown) => T): Promise<T | null> {
  return prismadb.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ settings: unknown }[]>`SELECT "settings" FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    if (rows.length === 0) return null;
    const value = next(settingsPart(rows[0].settings, part));
    await tx.$executeRaw`UPDATE "Store" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY[${part}]::text[], ${JSON.stringify(value)}::jsonb), "updatedAt" = now() WHERE id = ${storeId}`;
    return value;
  });
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
