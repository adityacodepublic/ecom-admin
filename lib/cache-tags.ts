/**
 * Cache tag names shared by the admin and the store (a copy of this file lives in both repos;
 * `node scripts/check-shared.mjs` in the admin repo checks they match).
 *
 * The store caches public reads under `<kind>-<storeId>`, one product page under `product-<id>`, one category page
 * under `category-<id>`, and the slug -> store lookup under `store-<slug>`.
 * The admin asks the store to expire those tags after a write, so both sides must build them the same way.
 */
export const TAG_KINDS = ["products", "categories", "filters", "page-layouts", "order-settings"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** `<kind>-<storeId>`: one kind of public read of one store. */
export const cacheTagFor = (kind: TagKind, storeId: string) => `${kind}-${storeId}`;

/** `store-<slug>`: the slug -> store lookup (name, logo, id). */
export const storeSlugTag = (slug: string) => `store-${slug}`;

/** `product-<productId>`: one product's own page. A product edit expires only this page (and the lists when its card changed). */
export const productTag = (productId: string) => `product-${productId}`;

/** `category-<categoryId>`: one category's own page. */
export const categoryTag = (categoryId: string) => `category-${categoryId}`;

/** Every `<kind>-<storeId>` tag of one store. */
export const storefrontTags = (storeId: string) => TAG_KINDS.map((k) => cacheTagFor(k, storeId));

export const isStoreSlugTag = (tag: string) => tag.startsWith("store-");

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const SLUG_PATTERN = /^[a-z0-9-]{3,63}$/;

/** True only for `<TagKind>-<id>`, `product-<id>`, `category-<id>` or `store-<slug>`, so a typo in a tag name fails loudly instead of doing nothing. */
export const isValidCacheTag = (tag: string): boolean => {
  if (isStoreSlugTag(tag)) return SLUG_PATTERN.test(tag.slice("store-".length));
  if (tag.startsWith("product-")) return ID_PATTERN.test(tag.slice("product-".length));
  if (tag.startsWith("category-")) return ID_PATTERN.test(tag.slice("category-".length));
  const kind = TAG_KINDS.find((k) => tag.startsWith(`${k}-`));
  return !!kind && ID_PATTERN.test(tag.slice(kind.length + 1));
};
