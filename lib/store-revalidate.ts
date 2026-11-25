import { after } from "next/server";

import { cacheTagFor, storeSlugTag } from "@/lib/cache-tags";
import { storeAppOrigin } from "@/lib/store-url";

/**
 * The storefront caches public reads (products, categories, filters, order settings) by tag.
 * After an admin write we ask the store app to drop those tags so the change shows at once. Best effort:
 * it never fails or delays the write, and on failure the cache simply runs out by itself (30-60s).
 *
 * Runs after the response is sent (`after()`). Where `after()` has no request to attach to (scripts, tests),
 * it just starts the call without waiting for it. Does nothing when the store app origin is not configured
 * (in production that is logged once, so a missing setting is not silent).
 */
const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let skipLogged = false;
function logSkippedOnce(reason: string) {
  if (skipLogged || process.env.NODE_ENV !== "production") return;
  skipLogged = true;
  console.error(`[STORE_REVALIDATE] skipped: ${reason}. The storefront will only refresh when its cache expires.`);
}

function configured() {
  // storeAppOrigin() falls back to localhost:3001 in path mode; only skip when nothing is set at all.
  const ok =
    process.env.NEXT_PUBLIC_TENANT_MODE === "subdomain"
      ? !!process.env.NEXT_PUBLIC_ROOT_DOMAIN
      : !!process.env.NEXT_PUBLIC_STORE_URL;
  if (!ok) logSkippedOnce("the store app URL is not configured (NEXT_PUBLIC_STORE_URL or NEXT_PUBLIC_ROOT_DOMAIN)");
  return ok;
}

/** Network errors, timeouts, 429 and 5xx may pass on a second try; 4xx (bad tag, bad secret) never will. */
const isTransientStatus = (status: number) => status === 429 || status >= 500;

async function post(tags: string[]) {
  const secret = process.env.STORE_API_SECRET ?? "";
  if (!secret) {
    logSkippedOnce("STORE_API_SECRET is not set");
    return;
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retry = false;
    try {
      const res = await fetch(`${storeAppOrigin()}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-store-secret": secret },
        body: JSON.stringify({ tag: tags }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      const body = await res.text().catch(() => "");
      console.error("[STORE_REVALIDATE] failed", { status: res.status, body, tags, attempt });
      retry = isTransientStatus(res.status);
    } catch (error) {
      console.error("[STORE_REVALIDATE]", error, { tags, attempt });
      retry = true; // network error or timeout
    }
    if (!retry || attempt === MAX_ATTEMPTS) return;
    await wait(RETRY_DELAYS_MS[attempt - 1]);
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
  schedule((["products", "categories", "filters"] as const).map((k) => cacheTagFor(k, storeId)));
}

/** Order settings and contact details (the store reads them as one cached value). */
export function revalidateStoreOrderSettings(storeId: string) {
  schedule([cacheTagFor("order-settings", storeId)]);
}

/** The saved layouts of the store's pages (home, category, product and custom pages). */
export function revalidateStorePageLayouts(storeId: string) {
  schedule([cacheTagFor("page-layouts", storeId)]);
}

/**
 * The store's name and logo (the store app caches its slug -> store lookup under store-<slug>).
 * Pass both slugs after a rename, so the old URL is a 404 and the new one works right away.
 */
export function revalidateStoreInfo(slugs: string | string[]) {
  const unique = Array.from(new Set((Array.isArray(slugs) ? slugs : [slugs]).filter(Boolean)));
  if (unique.length) schedule(unique.map(storeSlugTag));
}
