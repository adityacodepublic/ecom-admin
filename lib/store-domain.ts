import { Prisma } from "@prisma/client";

import { parseCustomDomain } from "@/lib/custom-domain";
import prismadb from "@/lib/prismadb";
import { revalidateStoreInfo } from "@/lib/store-revalidate";
import { settingsPart, updateSettingsPart } from "@/lib/store-settings";
import {
  addDomainToVercel,
  getDomainStatusFromVercel,
  removeDomainFromVercel,
  removeDomainFromVercelLater,
  triggerStorefrontRedeploy,
  type DomainStatus,
} from "@/lib/vercel-domains";

/**
 * Connecting and disconnecting a store's custom domain (Store.customDomain) and keeping Store.customDomainVerified
 * (is its DNS live on Vercel?) current. The storefront acts on a domain only while it is verified: it redirects the
 * platform URL there and uses it for canonical URLs; an unverified domain changes nothing for shoppers.
 *
 * What a change does:
 *  1. adds / removes the domain on the storefront's Vercel project,
 *  2. writes Store.customDomain (a unique index: one store per hostname) and Store.customDomainVerified,
 *  3. when the verified state of the store changed: expires the storefront's cached slug -> store lookup and rebuilds
 *     the storefront through its Deploy Hook (its build-time hostname -> slug map holds verified domains only).
 * Typing or fixing an unverified domain does none of step 3, so it has no rebuild and no cooldown. A change that does
 * rebuild is allowed once per COOLDOWN_MS, so a loop of saves cannot queue a rebuild each time.
 */
export const DOMAIN_COOLDOWN_MS = 60_000;

export type DomainResult =
  | { ok: true; customDomain: string | null; verified: boolean; status: DomainStatus | null }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number };

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Seconds left before a rebuilding change may be made again (0 = now). */
function cooldownLeft(settings: unknown): number {
  const raw = settingsPart(settings, "domainChange") as { at?: unknown } | undefined;
  const at = typeof raw?.at === "string" ? Date.parse(raw.at) : NaN;
  if (!Number.isFinite(at)) return 0;
  const left = at + DOMAIN_COOLDOWN_MS - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

const tooSoon = (seconds: number): DomainResult => ({
  ok: false,
  status: 429,
  error: `The domain was changed a moment ago. Try again in ${seconds} s.`,
  retryAfterSeconds: seconds,
});

async function recordChange(storeId: string) {
  await updateSettingsPart(storeId, "domainChange", () => ({ at: new Date().toISOString() })).catch((error) => {
    console.error("[STORE_DOMAIN] could not record the change time", error);
  });
}

async function loadStore(storeId: string, userId: string) {
  return prismadb.store.findFirst({
    where: { id: storeId, userId },
    select: { id: true, slug: true, customDomain: true, customDomainVerified: true, settings: true },
  });
}
type LoadedStore = NonNullable<Awaited<ReturnType<typeof loadStore>>>;

/**
 * Brings Store.customDomainVerified in line with the live Vercel state and returns the value now in force.
 *  - "connected" and not yet verified: verified (false -> true), cache expired, storefront rebuilt.
 *  - verified, but Vercel says the DNS is gone ("pending_dns", "not_added"): unverified (true -> false), same side effects.
 *  - anything else, "error" and "not_configured" above all (Vercel unreachable or not set up): no change. A flaky
 *    answer must never take a working domain away from shoppers.
 * The write is a compare-and-set, so two polls that see the same change rebuild the storefront once.
 */
async function syncVerified(store: LoadedStore, status: DomainStatus): Promise<boolean> {
  if (!store.customDomain) return false;
  const was = store.customDomainVerified;
  const to = status.state === "connected" ? true : status.state === "pending_dns" || status.state === "not_added" ? false : was;
  if (to === was) return was;
  const { count } = await prismadb.store.updateMany({
    where: { id: store.id, customDomain: store.customDomain, customDomainVerified: was },
    data: { customDomainVerified: to },
  });
  if (count !== 1) return was; // another request changed it first (and did the side effects)
  revalidateStoreInfo(store.slug);
  triggerStorefrontRedeploy(`custom domain of store ${store.id} ${to ? "verified" : "no longer verified"}`);
  return to;
}

/** The store's domain with its live Vercel status (`verify`: ask Vercel to check the TXT challenge again first). */
export async function getStoreDomain(storeId: string, userId: string, { verify = false } = {}): Promise<DomainResult> {
  const store = await loadStore(storeId, userId);
  if (!store) return { ok: false, status: 404, error: "Store not found" };
  if (!store.customDomain) return { ok: true, customDomain: null, verified: false, status: null };
  const status = await getDomainStatusFromVercel(store.customDomain, { verify });
  const verified = await syncVerified(store, status);
  return { ok: true, customDomain: store.customDomain, verified, status };
}

/** Connects `rawDomain` to the store, replacing its current domain. */
export async function setStoreDomain(storeId: string, userId: string, rawDomain: unknown): Promise<DomainResult> {
  const parsed = parseCustomDomain(rawDomain);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const { domain } = parsed;

  const store = await loadStore(storeId, userId);
  if (!store) return { ok: false, status: 404, error: "Store not found" };
  // Saving the same domain again: re-add it on Vercel (repairs "not_added") and re-check it, with no cooldown of its own.
  if (store.customDomain === domain) {
    const added = await addDomainToVercel(domain);
    if (!added.ok) return added;
    const status = await getDomainStatusFromVercel(domain);
    return { ok: true, customDomain: domain, verified: await syncVerified(store, status), status };
  }

  // Replacing a verified domain always rebuilds the storefront, so the cooldown applies up front. For an unverified
  // one it applies only if the new domain turns out to be live already (below): fixing a typo has no cooldown.
  const wait = cooldownLeft(store.settings);
  if (store.customDomainVerified && wait > 0) return tooSoon(wait);

  // A friendly answer before calling Vercel; the unique index below still decides a race.
  const taken = await prismadb.store.findFirst({ where: { customDomain: domain, NOT: { id: storeId } }, select: { id: true } });
  if (taken) return { ok: false, status: 409, error: "This domain is already connected to another store." };

  const added = await addDomainToVercel(domain);
  if (!added.ok) return added;

  const status = await getDomainStatusFromVercel(domain);
  const verified = status.state === "connected";
  const rebuilds = verified || store.customDomainVerified;
  if (rebuilds && wait > 0) {
    // Live already, but the storefront was rebuilt a moment ago: nothing is saved yet, so take it off Vercel again.
    removeDomainFromVercelLater(domain);
    return tooSoon(wait);
  }

  try {
    const { count } = await prismadb.store.updateMany({
      where: { id: storeId, userId },
      data: { customDomain: domain, customDomainVerified: verified },
    });
    if (count !== 1) {
      removeDomainFromVercelLater(domain);
      return { ok: false, status: 404, error: "Store not found" };
    }
  } catch (error) {
    // The domain was added on Vercel for nothing: take it off again.
    removeDomainFromVercelLater(domain);
    if (isUniqueViolation(error)) return { ok: false, status: 409, error: "This domain is already connected to another store." };
    throw error;
  }

  if (store.customDomain) removeDomainFromVercelLater(store.customDomain);
  if (rebuilds) {
    await recordChange(storeId);
    revalidateStoreInfo(store.slug);
    triggerStorefrontRedeploy(`custom domain set for store ${storeId}`);
  }
  return { ok: true, customDomain: domain, verified, status };
}

/** Disconnects the store's domain. Nothing connected = fine. */
export async function clearStoreDomain(storeId: string, userId: string): Promise<DomainResult> {
  const store = await loadStore(storeId, userId);
  if (!store) return { ok: false, status: 404, error: "Store not found" };
  if (!store.customDomain) return { ok: true, customDomain: null, verified: false, status: null };

  // Only a verified domain is in the storefront's map: removing it rebuilds the storefront, so the cooldown applies.
  const wait = store.customDomainVerified ? cooldownLeft(store.settings) : 0;
  if (wait > 0) return tooSoon(wait);

  // Vercel first: if that fails the domain stays saved, so the owner can try again (nothing is left behind on Vercel).
  const removed = await removeDomainFromVercel(store.customDomain);
  if (!removed.ok) return removed;

  await prismadb.store.updateMany({ where: { id: storeId, userId }, data: { customDomain: null, customDomainVerified: false } });
  if (store.customDomainVerified) {
    await recordChange(storeId);
    revalidateStoreInfo(store.slug);
    triggerStorefrontRedeploy(`custom domain removed for store ${storeId}`);
  }
  return { ok: true, customDomain: null, verified: false, status: null };
}
