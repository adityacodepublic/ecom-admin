/**
 * The store's navbar and footer as plain editable HTML (Tailwind classes) with readymade <store-* /> tags
 * and {{variables}} — no custom control syntax (#if / #each).
 * Shared by the admin (editor, defaults) and the store (renders it): this file is copied by hand between the repos
 * (scripts/check-shared.mjs checks that both copies match).
 *
 * Readymade tags (mounted as live components by the store):
 *   Navbar: <store-logo />, <store-search />, <store-cart />, <store-account />
 *   Footer: <store-categories />, <store-pages />, <store-contact />
 * Data variables (HTML-escaped when rendered):
 *   {{store.name}}, {{store.year}}, {{store.homeHref}}, {{store.cartHref}}, {{store.ordersHref}},
 *   {{contact.phone}}, {{contact.whatsapp}}
 */

export const CHROME_HTML_MAX = 50_000;

export interface ChromeTemplateData {
  store: { name: string; year: string; homeHref: string; cartHref: string; ordersHref: string };
  contact: { phone: string; whatsapp: string };
  categories: { name: string; href: string }[];
  pages: { title: string; href: string }[];
}

export const DEFAULT_NAVBAR_HTML = `<!-- Readymade tags (mounted as live React components):
  <store-logo />    Store logo & name linking to Home
  <store-search />  Live product search bar
  <store-cart />    Live Cart button with item count
  <store-account /> Clerk Sign in / Account menu
  Variables: {{store.name}}, {{store.homeHref}}
-->
<header class="border-b z-20 fixed w-full glass top-0">
  <div class="mx-auto max-w-7xl">
    <div class="h-[3.1rem] lg:h-[3.25rem] relative px-3 lg:px-8 flex items-center gap-2 sm:gap-3">
      <store-logo />
      <store-search />
      <div class="flex items-center gap-4">
        <store-cart />
        <store-account />
      </div>
    </div>
  </div>
</header>
`;

export const DEFAULT_FOOTER_HTML = `<!-- Readymade tags (automatically omit empty lists or unset contact numbers):
  <store-categories />  Categories column with links to each category
  <store-pages />       List items for each custom page
  <store-contact />     Contact column with Call & WhatsApp links
  Variables: {{store.name}}, {{store.year}}, {{store.homeHref}}, {{store.cartHref}}, {{store.ordersHref}}, {{contact.phone}}, {{contact.whatsapp}}
-->
<footer class="border-t bg-background">
  <div class="mx-auto max-w-7xl px-4 py-10 lg:px-8">
    <div class="grid grid-cols-2 gap-8 lg:grid-cols-4">
      <div class="col-span-2 space-y-2 lg:col-span-1">
        <a href="{{store.homeHref}}" class="text-lg font-semibold">{{store.name}}</a>
        <p class="text-sm text-muted-foreground">Quality products, delivered to your door.</p>
      </div>

      <store-categories />

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">Quick Links</h3>
        <ul class="space-y-1 text-sm text-muted-foreground">
          <li><a href="{{store.homeHref}}" class="hover:text-foreground">Home</a></li>
          <li><a href="{{store.cartHref}}" class="hover:text-foreground">Cart</a></li>
          <li><a href="{{store.ordersHref}}" class="hover:text-foreground">My Orders</a></li>
          <store-pages />
        </ul>
      </div>

      <store-contact />
    </div>

    <div class="mt-6 pt-2 text-center text-xs text-muted-foreground">
      &copy; {{store.year}} {{store.name}}.
    </div>
  </div>
</footer>
`;

const FORBIDDEN: [RegExp, string][] = [
  [/<\s*script/i, "<script> is not allowed."],
  [/<\s*iframe/i, "<iframe> is not allowed."],
  [/<\s*object/i, "<object> is not allowed."],
  [/<\s*embed/i, "<embed> is not allowed."],
  [/javascript\s*:/i, "javascript: links are not allowed."],
  [/[\s"'/]on[a-z]+\s*=/i, "Inline event handlers (onclick=, onload=, ...) are not allowed."],
];

/** An error message for HTML the store must not render, or null when it is fine ("" is fine: it means use the default). */
export function validateChromeHtml(html: string): string | null {
  if (html === "") return null;
  if (html.length > CHROME_HTML_MAX) return `Too long: use at most ${CHROME_HTML_MAX.toLocaleString("en-US")} characters.`;
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(html)) return message;
  return null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const VAR_TAG = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replaces {{store.*}} and {{contact.*}} placeholders with HTML-escaped values and strips HTML comments.
 * Unknown variables render as "".
 */
export function renderChromeTemplate(template: string, data: ChromeTemplateData): string {
  const withoutComments = template.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments.replace(VAR_TAG, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      data,
    );
    return typeof value === "string" || typeof value === "number" ? escapeHtml(String(value)) : "";
  });
}
