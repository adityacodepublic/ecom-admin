import { z } from "zod";

import { readSettings, settingsPart, updateSettingsPart } from "@/lib/store-settings";

/**
 * Store.settings.contact (JSON, missing = nothing set): how customers can reach the store.
 * Used by the order pages (Call / WhatsApp buttons) and anything else that needs it (footer, emails).
 */
const field = z.string().trim().max(100);
const addressField = z.string().trim().max(300);

export const contactSchema = z.object({
  phone: field.default(""),
  whatsapp: field.default(""), // a phone number with country code, e.g. 919876543210 (used for wa.me links)
  email: z.union([z.string().trim().email().max(100), z.literal("")]).default(""),
  address: addressField.default(""),
});
export type StoreContact = z.infer<typeof contactSchema>;

/** PATCH body: any subset; fields merge into the current ones. */
export const contactPatchSchema = z
  .object({
    phone: field.optional(),
    whatsapp: field.optional(),
    email: z.union([z.string().trim().email().max(100), z.literal("")]).optional(),
    address: addressField.optional(),
  })
  .strict();
export type StoreContactPatch = z.infer<typeof contactPatchSchema>;

/** The stored settings JSON -> full contact with defaults. Bad stored data falls back to empty. */
export function parseContact(settings: unknown): StoreContact {
  const r = contactSchema.safeParse(settingsPart(settings, "contact") ?? {});
  if (r.success) return r.data;
  console.error("[STORE_CONTACT] invalid stored contact, using empty", r.error.issues);
  return contactSchema.parse({});
}

export async function getContact(storeId: string): Promise<StoreContact | null> {
  const settings = await readSettings(storeId);
  return settings === null ? null : parseContact(settings);
}

/** Merges a patch into the store's contact (owner check is the caller's job). */
export async function updateContact(storeId: string, patch: StoreContactPatch): Promise<StoreContact | null> {
  return updateSettingsPart(storeId, "contact", (current) => contactSchema.parse({ ...parseContact({ contact: current }), ...patch }));
}
