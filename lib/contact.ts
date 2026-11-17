import { z } from "zod";

import prismadb from "@/lib/prismadb";

/**
 * Store.contact (JSON, null = nothing set): how customers can reach the store.
 * Used by the order pages (Call / WhatsApp buttons) and anything else that needs it (footer, emails).
 */
const field = z.string().trim().max(100);

export const contactSchema = z.object({
  phone: field.default(""),
  whatsapp: field.default(""), // a phone number with country code, e.g. 919876543210 (used for wa.me links)
  email: z.union([z.string().trim().email().max(100), z.literal("")]).default(""),
});
export type StoreContact = z.infer<typeof contactSchema>;

/** PATCH body: any subset; fields merge into the current ones. */
export const contactPatchSchema = z
  .object({
    phone: field.optional(),
    whatsapp: field.optional(),
    email: z.union([z.string().trim().email().max(100), z.literal("")]).optional(),
  })
  .strict();
export type StoreContactPatch = z.infer<typeof contactPatchSchema>;

/** The stored JSON -> full contact with defaults. Bad stored data falls back to empty. */
export function parseContact(raw: unknown): StoreContact {
  const r = contactSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  console.error("[STORE_CONTACT] invalid stored contact, using empty", r.error.issues);
  return contactSchema.parse({});
}

export async function getContact(storeId: string): Promise<StoreContact | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { contact: true } });
  return store ? parseContact(store.contact) : null;
}

/** Merges a patch into the store's contact (owner check is the caller's job). */
export async function updateContact(storeId: string, patch: StoreContactPatch): Promise<StoreContact | null> {
  return prismadb.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ contact: unknown }[]>`
      SELECT "contact" FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    if (rows.length === 0) return null;
    const next = contactSchema.parse({ ...parseContact(rows[0].contact), ...patch });
    await tx.store.update({ where: { id: storeId }, data: { contact: next } });
    return next;
  });
}
