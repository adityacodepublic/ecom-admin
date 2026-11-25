/**
 * The public URL of a store, built from its slug. Driven by env, so moving from
 * path mode to subdomains later is an env change only:
 *   NEXT_PUBLIC_TENANT_MODE    "path" (default) or "subdomain"
 *   NEXT_PUBLIC_STORE_URL      path mode: the store app's origin, e.g. https://ecom-store-new.vercel.app
 *   NEXT_PUBLIC_ROOT_DOMAIN    subdomain mode: e.g. myshop.com or localhost:3001
 *   NEXT_PUBLIC_STORE_PROTOCOL subdomain mode: "https" (default) or "http" (local dev)
 */
const isSubdomainMode = () => process.env.NEXT_PUBLIC_TENANT_MODE === "subdomain";
const protocol = () => process.env.NEXT_PUBLIC_STORE_PROTOCOL || "https";

/** The store app itself (no store): path mode NEXT_PUBLIC_STORE_URL, subdomain mode the root domain. */
export function storeAppOrigin(): string {
  if (isSubdomainMode()) return `${protocol()}://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`;
  return (process.env.NEXT_PUBLIC_STORE_URL || "http://localhost:3001").replace(/\/+$/, "");
}

export function storeUrl(slug: string): string {
  if (isSubdomainMode()) return `${protocol()}://${slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`;
  return `${storeAppOrigin()}/${slug}`;
}
