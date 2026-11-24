import { after } from "next/server";
import { storeAppOrigin } from "@/lib/store-url";

/**
 * The storefront caches public reads (products, categories, filters, order settings) by tag.
 * After an admin write we ask the store app to drop those tags so the change shows at once. Best effort:
 * it never fails or delays the write, and on failure the cache simply runs out by itself (30-60s).
 *
 * Runs after the response is sent (`after()`). Where `after()` has no request to attach to (scripts, tests),
 * it just starts the call without waiting for it. Does nothing when the store app origin is not configured.
 */
const TIMEOUT_MS = 2000;

function configured() {
  // storeAppOrigin() falls back to localhost:3001 in path mode; only skip when nothing is set at all.
  if (process.env.NEXT_PUBLIC_TENANT_MODE === "subdomain") return !!process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return !!process.env.NEXT_PUBLIC_STORE_URL;
}

async function post(tags: string[]) {
  const secret = process.env.STORE_API_SECRET ?? "";
  if (!secret) return;
  try {
    await fetch(`${storeAppOrigin()}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-store-secret": secret },
      body: JSON.stringify({ tag: tags }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[STORE_REVALIDATE]", error);
  }
}

function schedule(tags: string[]) {
  if (!configured()) return;
  try {
    after(() => post(tags));
  } catch {
    void post(tags); // outside a request scope
  }
}

/** Products, categories and filters embed each other's data, so any catalog write refreshes all three. */
export function revalidateStoreCatalog(storeId: string) {
  schedule(["products", "categories", "filters"].map((t) => `${t}-${storeId}`));
}

/** Order settings and contact details (the store reads them as one cached value). */
export function revalidateStoreOrderSettings(storeId: string) {
  schedule([`order-settings-${storeId}`]);
}

/** The store's name and logo (the store app caches its slug -> store lookup under store-<slug>). */
export function revalidateStoreInfo(slug: string) {
  schedule([`store-${slug}`]);
}
