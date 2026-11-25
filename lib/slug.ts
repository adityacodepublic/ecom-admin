/**
 * Store slugs: the part of the store URL that names the store
 * (path mode: <store app>/<slug>, subdomain mode: <slug>.<root domain>).
 * The owner chooses it (the form suggests slugify(name)) and can change it later; the server never
 * changes what the owner typed. The rules are the DNS label rules, so a slug also works as a subdomain.
 */
export const SLUG_MIN = 3;
export const SLUG_MAX = 63;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Words that can never be a store slug: they are (or may become) platform hosts or routes. */
export const RESERVED_SLUGS = new Set([
  "www", "admin", "api", "app", "dashboard", "store", "stores", "mail", "email", "smtp", "ftp",
  "cdn", "static", "assets", "media", "img", "images", "docs", "help", "support", "status", "blog",
  "auth", "login", "logout", "signin", "signup", "sign-in", "sign-up", "user-profile", "account",
  "billing", "checkout", "cart", "orders", "pay", "preview", "test", "dev", "staging", "localhost",
  "vercel", "next", "favicon", "site-icon", "robots", "sitemap",
]);

// "--" is not allowed: it also blocks the "xn--" punycode prefix.
export const isValidSlug = (slug: string) => slugError(slug) === null;

/** The suggestion for a name: "Rahul's Shoes & Co." -> "rahuls-shoes-co". May be "" or not valid: the form shows why. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Why a slug is not allowed, or null when it is fine. Shown as the form field error. */
export function slugError(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `At least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `At most ${SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug)) return "Only lowercase letters, numbers and hyphens, starting and ending with a letter or number.";
  if (slug.includes("--")) return "No double hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "This word is reserved. Choose another URL name.";
  return null;
}

export const SLUG_TAKEN_MESSAGE = "This URL name is already taken";
