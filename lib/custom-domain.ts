/**
 * Custom domains: a store owner's own hostname for the storefront ("shop.mybrand.com"). Stored in
 * Store.customDomain, normalized: lowercase ASCII (punycode for international names), no protocol, port,
 * path or trailing dot. The storefront maps the hostname to the store's slug (its proxy.ts), and the domain
 * is added to the storefront's Vercel project (lib/vercel-domains.ts).
 */

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** The last label: letters only, or a punycode TLD. This also rules out IPv4 addresses ("1.2.3.4"). */
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const MAX_LENGTH = 253;

/** Hostnames of Vercel and of our own platform: never a store's custom domain. Subdomains included. */
const ALWAYS_BLOCKED = ["vercel.app", "vercel.com", "vercel-dns.com", "now.sh", "vercel.sh"];
/** Names that only exist on a local machine or are reserved for tests and docs (RFC 2606 / 6761). */
const RESERVED_SUFFIXES = ["localhost", "local", "test", "example", "invalid", "internal", "lan", "home.arpa"];

const hostOf = (raw: string | undefined): string | null => {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** Our own hosts (the storefront, the root domain in subdomain mode, the admin): blocked with their subdomains. */
export function platformHosts(): string[] {
  const hosts = [
    hostOf(process.env.NEXT_PUBLIC_STORE_URL),
    hostOf(process.env.NEXT_PUBLIC_ROOT_DOMAIN),
    hostOf(process.env.NEXT_PUBLIC_APP_URL),
    hostOf(process.env.NEXT_PUBLIC_ADMIN_URL),
    hostOf(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    hostOf(process.env.VERCEL_URL),
  ];
  return Array.from(new Set([...ALWAYS_BLOCKED, ...hosts.filter((h): h is string => !!h)]));
}

const isUnder = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`);

/**
 * What the owner typed -> the bare hostname: trims, lowercases, drops "https://", a path, a query and a
 * trailing dot, and turns an international name into punycode. "" when nothing usable is left. Not validated:
 * use parseCustomDomain.
 */
export function normalizeDomain(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  s = s.split(/[/?#]/)[0]; // path, query, hash
  s = s.replace(/\.+$/, ""); // trailing dot (fully qualified form)
  if (!s || /[\s@\\]/.test(s)) return s;
  if (s.includes(":")) return s; // a port (or IPv6): kept so domainError can say why
  try {
    // The WHATWG URL parser lowercases and converts Unicode names to punycode ("bücher.de" -> "xn--bcher-kva.de").
    return new URL(`http://${s}`).hostname.replace(/\.+$/, "");
  } catch {
    return s;
  }
}

/** Why a normalized hostname cannot be a custom domain, or null when it can. Shown to the owner. */
export function domainError(domain: string): string | null {
  if (!domain) return "Enter a domain, for example shop.mybrand.com.";
  if (domain.includes(":") || domain.startsWith("[")) return "Leave out the port: only the domain name, for example shop.mybrand.com.";
  if (/[\s@\\/]/.test(domain)) return "Only the domain name, for example shop.mybrand.com.";
  if (domain.length > MAX_LENGTH) return `At most ${MAX_LENGTH} characters.`;
  const labels = domain.split(".");
  if (labels.length < 2) return "Use a full domain with a dot, for example shop.mybrand.com.";
  if (labels.some((l) => !LABEL_RE.test(l))) return "Only letters, numbers, hyphens and dots, for example shop.mybrand.com.";
  if (!TLD_RE.test(labels[labels.length - 1])) return "This is not a domain name (IP addresses are not allowed).";
  if (RESERVED_SUFFIXES.some((r) => isUnder(domain, r))) return "This is a local or reserved name, not a public domain.";
  if (platformHosts().some((p) => isUnder(domain, p))) return "This domain belongs to the platform. Use a domain you own.";
  return null;
}

export type ParsedDomain = { ok: true; domain: string } | { ok: false; error: string };

/** normalizeDomain + domainError in one step. */
export function parseCustomDomain(raw: unknown): ParsedDomain {
  const domain = normalizeDomain(raw);
  const error = domainError(domain);
  return error ? { ok: false, error } : { ok: true, domain };
}

/** Second-level labels under which registrations happen ("brand.co.in" is an apex, not a subdomain of "co.in"). */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in",
  "com.au", "net.au", "org.au", "co.nz", "org.nz", "co.za", "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.sg", "com.my", "com.cn", "com.hk", "com.tr", "co.kr", "co.id", "com.ar", "com.pk", "com.bd", "com.np", "com.ng",
]);

/**
 * The registrable domain ("apex") of a hostname: "shop.mybrand.com" -> "mybrand.com". A best guess for when
 * Vercel's answer (its apexName) is not available; Vercel's value wins when it is.
 */
export function guessApexDomain(domain: string): string {
  const labels = domain.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const take = MULTI_PART_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** The DNS "name" field for a record on `fqdn` inside the zone `apex`: "@" for the apex itself, "shop" for shop.<apex>. */
export function recordName(fqdn: string, apex: string): string {
  const host = fqdn.toLowerCase().replace(/\.+$/, "");
  if (host === apex) return "@";
  return host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host;
}
