/**
 * The store's navbar and footer as editable HTML (Tailwind classes) with a few {{variables}}.
 * Shared by the admin (editor, defaults) and the store (renders it): this file is copied by hand between the repos
 * (scripts/check-shared.mjs checks that both copies match).
 *
 * Template syntax (HTML comments are removed before rendering, so they can document a template):
 *   {{store.name}}                      a value, HTML-escaped
 *   {{#each categories}}...{{/each}}    repeat for each item; inside, {{name}} and {{href}}
 *   {{#each pages}}...{{/each}}         repeat for each item; inside, {{title}} and {{href}}
 *   {{#if categories}}...{{/if}}        show only when the value is set (a non-empty list or text)
 *   {{#if contact.phone contact.whatsapp}}...{{/if}}   several values: show when any one is set
 * The navbar also has four interactive slots (<store-logo />, <store-search />, <store-cart />, <store-account />):
 * the store app replaces them with live components after rendering.
 */

export const CHROME_HTML_MAX = 50_000;

export interface ChromeTemplateData {
  store: { name: string; year: string; homeHref: string; cartHref: string; ordersHref: string };
  contact: { phone: string; whatsapp: string };
  categories: { name: string; href: string }[];
  pages: { title: string; href: string }[];
}

export const DEFAULT_NAVBAR_HTML = `<!-- Interactive slots (mounted as live React components):
  <store-logo />    Store logo & name linking to Home
  <store-search />  Live product search bar
  <store-cart />    Live Cart button with item count
  <store-account /> Clerk Sign in / Account menu
  Variables: {{store.name}}, {{store.homeHref}}, {{#each categories}}({{name}}, {{href}}){{/each}}, {{#each pages}}({{title}}, {{href}}){{/each}}
-->
<header class="border-b z-20 fixed w-full glass top-0">
  <div class="mx-auto max-w-7xl">
    <div class="h-[3.2rem] lg:h-[3.4rem] relative px-2 lg:px-8 flex items-center gap-2">
      <store-logo />
      <store-search />
      <div class="flex items-center gap-1 sm:gap-2">
        <store-cart />
        <store-account />
      </div>
    </div>
  </div>
</header>
`;

export const DEFAULT_FOOTER_HTML = `<!-- Variables (HTML-escaped when rendered):
  {{store.name}}  {{store.year}}  {{store.homeHref}}  {{store.cartHref}}  {{store.ordersHref}}
  {{contact.phone}}  {{contact.whatsapp}}
  {{#each categories}} ... {{name}} {{href}} ... {{/each}}
  {{#each pages}} ... {{title}} {{href}} ... {{/each}}
  {{#if categories}} {{#if pages}} {{#if contact.phone}} {{#if contact.whatsapp}} ... {{/if}}
  {{#if contact.phone contact.whatsapp}} ... {{/if}}   (shown when any one is set)
-->
<footer class="border-t bg-background">
  <div class="mx-auto max-w-7xl px-4 py-10 lg:px-8">
    <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div class="space-y-2">
        <a href="{{store.homeHref}}" class="text-lg font-semibold">{{store.name}}</a>
        <p class="text-sm text-muted-foreground">Quality products, delivered to your door.</p>
      </div>

      {{#if categories}}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">Categories</h3>
        <ul class="space-y-1 text-sm text-muted-foreground">
          {{#each categories}}
          <li><a href="{{href}}" class="hover:text-foreground">{{name}}</a></li>
          {{/each}}
        </ul>
      </div>
      {{/if}}

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">Quick Links</h3>
        <ul class="space-y-1 text-sm text-muted-foreground">
          <li><a href="{{store.homeHref}}" class="hover:text-foreground">Home</a></li>
          <li><a href="{{store.cartHref}}" class="hover:text-foreground">Cart</a></li>
          <li><a href="{{store.ordersHref}}" class="hover:text-foreground">My Orders</a></li>
          {{#each pages}}
          <li><a href="{{href}}" class="hover:text-foreground">{{title}}</a></li>
          {{/each}}
        </ul>
      </div>

      {{#if contact.phone contact.whatsapp}}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">Contact</h3>
        <ul class="space-y-1 text-sm text-muted-foreground">
          {{#if contact.phone}}
          <li><a href="tel:{{contact.phone}}" class="hover:text-foreground">Call {{contact.phone}}</a></li>
          {{/if}}
          {{#if contact.whatsapp}}
          <li><a href="https://wa.me/{{contact.whatsapp}}" class="hover:text-foreground">WhatsApp</a></li>
          {{/if}}
        </ul>
      </div>
      {{/if}}
    </div>

    <div class="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
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

// ---- renderer

type Node =
  | { kind: "text"; text: string }
  | { kind: "var"; path: string }
  | { kind: "each"; path: string; children: Node[] }
  | { kind: "if"; paths: string[]; children: Node[] };

const TAG = /\{\{\s*(#each|#if|\/each|\/if)?\s*([\w. ]*?)\s*\}\}/g;

/** Template text -> tree. Unclosed blocks close at the end; a stray closing tag is ignored. */
function parse(template: string): Node[] {
  const root: Node[] = [];
  const stack: { type: "each" | "if"; children: Node[] }[] = [];
  const current = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  const tag = new RegExp(TAG.source, "g");
  let m: RegExpExecArray | null;
  while ((m = tag.exec(template))) {
    const start = m.index;
    if (start > last) current().push({ kind: "text", text: template.slice(last, start) });
    last = start + m[0].length;
    const [, directive, path] = m;
    if (directive === "#each") {
      const children: Node[] = [];
      current().push({ kind: "each", path, children });
      stack.push({ type: "each", children });
    } else if (directive === "#if") {
      const children: Node[] = [];
      current().push({ kind: "if", paths: path.split(/\s+/).filter(Boolean), children });
      stack.push({ type: "if", children });
    } else if (directive === "/each" || directive === "/if") {
      if (stack.length && stack[stack.length - 1].type === directive.slice(1)) stack.pop();
    } else {
      current().push({ kind: "var", path });
    }
  }
  if (last < template.length) current().push({ kind: "text", text: template.slice(last) });
  return root;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

type Scope = Record<string, unknown>;

/** A dotted path, looked up in the current list item first, then in the data. */
function lookup(path: string, item: Scope | null, data: Scope): unknown {
  const walk = (root: unknown) =>
    path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Scope)[key] : undefined), root);
  const own = item ? walk(item) : undefined;
  return own !== undefined ? own : walk(data);
}

const isSet = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim() !== "" : !!value);

function evaluate(nodes: Node[], item: Scope | null, data: Scope): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.text;
    } else if (node.kind === "var") {
      const value = lookup(node.path, item, data);
      out += typeof value === "string" || typeof value === "number" ? escapeHtml(String(value)) : "";
    } else if (node.kind === "if") {
      if (node.paths.some((p) => isSet(lookup(p, item, data)))) out += evaluate(node.children, item, data);
    } else {
      const list = lookup(node.path, item, data);
      if (Array.isArray(list)) {
        for (const entry of list) out += evaluate(node.children, entry && typeof entry === "object" ? (entry as Scope) : null, data);
      }
    }
  }
  return out;
}

/**
 * Fills a navbar/footer template with the store's data. Pure: values are HTML-escaped and inserted once (a value
 * that looks like {{x}} stays text). HTML comments are removed first. Unknown variables render as "".
 */
export function renderChromeTemplate(template: string, data: ChromeTemplateData): string {
  return evaluate(parse(template.replace(/<!--[\s\S]*?-->/g, "")), null, data as unknown as Scope);
}
