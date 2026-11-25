import { after } from "next/server";

import { cacheTagFor, storeSlugTag } from "@/lib/cache-tags";
import prismadb from "@/lib/prismadb";
import { settingsPart, updateSettingsPart } from "@/lib/store-settings";
import { storeAppOrigin } from "@/lib/store-url";

/**
 * The storefront caches public reads (products, categories, filters, order settings, store info) for a day
 * and relies on the admin to drop those tags right after a write. Best effort: it never fails or delays the
 * write, retries transient errors, emits structured JSON logs, and persists recent failures in
 * Store.settings.revalidation so broken revalidation is visible and monitorable.
 */
const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];
const MAX_RECENT_ERRORS = 20;

export interface RevalidationErrorEntry {
  at: string;
  tags: string[];
  status: number | null;
  error: string;
  attempts: number;
}

export interface RevalidationHealth {
  ok: boolean;
  consecutiveFailures: number;
  lastFailedAt: string | null;
  lastRecoveredAt: string | null;
  recentErrors: RevalidationErrorEntry[];
}

export function parseRevalidationHealth(settings: unknown): RevalidationHealth {
  const raw = settingsPart(settings, "revalidation");
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const consecutiveFailures = typeof obj.consecutiveFailures === "number" && obj.consecutiveFailures > 0 ? obj.consecutiveFailures : 0;
  const recentErrors = Array.isArray(obj.recentErrors) ? (obj.recentErrors as RevalidationErrorEntry[]).slice(-MAX_RECENT_ERRORS) : [];
  return {
    ok: consecutiveFailures === 0,
    consecutiveFailures,
    lastFailedAt: typeof obj.lastFailedAt === "string" ? obj.lastFailedAt : null,
    lastRecoveredAt: typeof obj.lastRecoveredAt === "string" ? obj.lastRecoveredAt : null,
    recentErrors,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stores that had a failure in this process, so we only write recovery once (zero extra DB writes when healthy). */
const failingStores = new Set<string>();

let skipLogged = false;
function logSkippedOnce(reason: string) {
  if (skipLogged || process.env.NODE_ENV !== "production") return;
  skipLogged = true;
  console.error(JSON.stringify({ event: "store_revalidate_skipped", reason, at: new Date().toISOString() }));
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

interface RevalidateTarget {
  storeId?: string;
  slugs?: string[];
}

async function resolveStoreId(target: RevalidateTarget): Promise<string | null> {
  if (target.storeId) return target.storeId;
  const slug = target.slugs?.[0];
  if (!slug) return null;
  const store = await prismadb.store.findUnique({ where: { slug }, select: { id: true } }).catch(() => null);
  return store?.id ?? null;
}

async function recordFailure(target: RevalidateTarget, entry: RevalidationErrorEntry) {
  console.error(
    JSON.stringify({
      event: "store_revalidate_failed",
      target: storeAppOrigin(),
      storeId: target.storeId ?? null,
      ...entry,
    }),
  );
  const storeId = await resolveStoreId(target);
  if (!storeId) return;
  failingStores.add(storeId);
  await updateSettingsPart(storeId, "revalidation", (current) => {
    const prev = parseRevalidationHealth({ revalidation: current });
    return {
      consecutiveFailures: prev.consecutiveFailures + 1,
      lastFailedAt: entry.at,
      lastRecoveredAt: prev.lastRecoveredAt,
      recentErrors: [...prev.recentErrors, entry].slice(-MAX_RECENT_ERRORS),
    };
  }).catch((err) => {
    console.error("[STORE_REVALIDATE] could not persist failure", err);
  });
}

async function recordRecoveryIfNeeded(target: RevalidateTarget) {
  const storeId = target.storeId ?? (failingStores.size > 0 ? await resolveStoreId(target) : null);
  if (!storeId || !failingStores.has(storeId)) return;
  failingStores.delete(storeId);
  await updateSettingsPart(storeId, "revalidation", (current) => {
    const prev = parseRevalidationHealth({ revalidation: current });
    return {
      consecutiveFailures: 0,
      lastFailedAt: prev.lastFailedAt,
      lastRecoveredAt: new Date().toISOString(),
      recentErrors: prev.recentErrors,
    };
  }).catch(() => undefined);
}

async function post(tags: string[], target: RevalidateTarget) {
  const secret = process.env.STORE_API_SECRET ?? "";
  if (!secret) {
    logSkippedOnce("STORE_API_SECRET is not set");
    if (process.env.NODE_ENV === "production") {
      await recordFailure(target, {
        at: new Date().toISOString(),
        tags,
        status: null,
        error: "STORE_API_SECRET is not set",
        attempts: 0,
      });
    }
    return;
  }

  let lastStatus: number | null = null;
  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retry = false;
    try {
      const res = await fetch(`${storeAppOrigin()}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-store-secret": secret },
        body: JSON.stringify({ tag: tags }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        await recordRecoveryIfNeeded(target);
        return;
      }
      const body = await res.text().catch(() => "");
      lastStatus = res.status;
      lastError = body.slice(0, 300) || `HTTP ${res.status}`;
      retry = isTransientStatus(res.status);
    } catch (error) {
      lastStatus = null;
      lastError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      retry = true; // network error or timeout
    }

    if (!retry || attempt === MAX_ATTEMPTS) {
      await recordFailure(target, {
        at: new Date().toISOString(),
        tags,
        status: lastStatus,
        error: lastError,
        attempts: attempt,
      });
      return;
    }
    await wait(RETRY_DELAYS_MS[attempt - 1]);
  }
}

function schedule(tags: string[], target: RevalidateTarget) {
  if (!configured()) return;
  try {
    after(() => post(tags, target));
  } catch {
    void post(tags, target); // outside a request scope
  }
}

/** Products, categories and filters embed each other's data, so any catalog write refreshes all three. */
export function revalidateStoreCatalog(storeId: string) {
  schedule(
    (["products", "categories", "filters"] as const).map((k) => cacheTagFor(k, storeId)),
    { storeId },
  );
}

/** Order settings and contact details (the store reads them as one cached value). */
export function revalidateStoreOrderSettings(storeId: string) {
  schedule([cacheTagFor("order-settings", storeId)], { storeId });
}

/** The saved layouts of the store's pages (home, category, product and custom pages). */
export function revalidateStorePageLayouts(storeId: string) {
  schedule([cacheTagFor("page-layouts", storeId)], { storeId });
}

/**
 * The store's name and logo (the store app caches its slug -> store lookup under store-<slug>).
 * Pass both slugs after a rename, so the old URL is a 404 and the new one works right away.
 */
export function revalidateStoreInfo(slugs: string | string[]) {
  const unique = Array.from(new Set((Array.isArray(slugs) ? slugs : [slugs]).filter(Boolean)));
  if (unique.length) schedule(unique.map(storeSlugTag), { slugs: unique });
}
