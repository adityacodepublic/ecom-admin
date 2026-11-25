/**
 * Cache tag names shared by the admin and the store (a copy of this file lives in both repos;
 * `node scripts/check-shared.mjs` in the admin repo checks they match).
 *
 * The store caches public reads under `<kind>-<storeId>` and the slug -> store lookup under `store-<slug>`.
 * The admin asks the store to expire those tags after a write, so both sides must build them the same way.
 */
export const TAG_KINDS = ["products", "categories", "filters", "page-layouts", "order-settings"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** `<kind>-<storeId>`: one kind of public read of one store. */
export const cacheTagFor = (kind: TagKind, storeId: string) => `${kind}-${storeId}`;

/** `store-<slug>`: the slug -> store lookup (name, logo, id). */
export const storeSlugTag = (slug: string) => `store-${slug}`;

/** Every `<kind>-<storeId>` tag of one store. */
export const storefrontTags = (storeId: string) => TAG_KINDS.map((k) => cacheTagFor(k, storeId));

export const isStoreSlugTag = (tag: string) => tag.startsWith("store-");

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const SLUG_PATTERN = /^[a-z0-9-]{3,63}$/;

/** True only for `<TagKind>-<id>` or `store-<slug>`, so a typo in a tag name fails loudly instead of doing nothing. */
export const isValidCacheTag = (tag: string): boolean => {
  if (isStoreSlugTag(tag)) return SLUG_PATTERN.test(tag.slice("store-".length));
  const kind = TAG_KINDS.find((k) => tag.startsWith(`${k}-`));
  return !!kind && ID_PATTERN.test(tag.slice(kind.length + 1));
};
