# Navbar and footer

The navbar and footer appear on every page of the store. Edit them as plain HTML with Tailwind CSS classes, readymade store tags, and escaped data variables. Router: `{{BASE}}/skill/index`.

For page-specific sections that need JavaScript or custom data queries, use a `custom` block in `{{BASE}}/skill/pages`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/chrome` | | `{ navbarHtml, footerHtml, defaults: { navbarHtml, footerHtml } }` |
| `PATCH {{BASE}}/chrome` | `{ navbarHtml, footerHtml }` | `{ navbarHtml, footerHtml, defaults: { navbarHtml, footerHtml } }` |

Send both `navbarHtml` and `footerHtml` on `PATCH`. Unknown keys return `400`. An empty string `""` means the store uses its built-in default template. Each field accepts up to 50,000 characters.

## How it renders

The store renders `navbarHtml` and `footerHtml` directly in the main server-rendered page. There is no iframe and no custom JavaScript. Search engines crawl all text and links in the markup.

The server compiles CSS for every Tailwind CSS v4 class present in your saved HTML. You do not need to load Tailwind. Inline `style="..."` attributes work, but `<style>` tags are dropped at render time. HTML comments are stripped.

Internal links that start with `/` (such as `/cart` or `/summer-sale`) use client-side navigation and keep the store base path automatically.

## Readymade tags

Drop these self-closing tags into your HTML. The store replaces each tag with a live component.

### Navbar tags

| Tag | Renders |
| --- | --- |
| `<store-logo />` | Store logo and name, linked to the home page. |
| `<store-search />` | Live product search bar. |
| `<store-cart />` | Cart button with the live item count. |
| `<store-account />` | Sign-in button or customer account menu. |

### Footer tags

| Tag | Renders |
| --- | --- |
| `<store-categories />` | Categories column with links to each category. Omitted when the store has no categories. |
| `<store-pages />` | `<li>` link items for each custom page. Place inside a `<ul>`. Omitted when the store has no custom pages. |
| `<store-contact />` | Contact column with Call and WhatsApp links. Omitted when both phone and WhatsApp are unset. |

## Data variables

Write variables as `{{name}}`. The store HTML-escapes every value before rendering. Unknown variables render as empty text. There is no conditional or loop syntax (`#if` or `#each`).

| Variable | Value |
| --- | --- |
| `{{store.name}}` | Store name. |
| `{{store.year}}` | Current four-digit year. |
| `{{store.homeHref}}` | Home page path. |
| `{{store.cartHref}}` | Cart page path. |
| `{{store.ordersHref}}` | Customer orders page path. |
| `{{contact.phone}}` | Store phone number, or empty if unset. |
| `{{contact.whatsapp}}` | Store WhatsApp number as digits with country code, ready for `https://wa.me/{{contact.whatsapp}}`, or empty if unset. |

## Blocked HTML

The server refuses `PATCH` with `400` if `navbarHtml` or `footerHtml` contains any of these:

- `<script>`, `<iframe>`, `<object>`, or `<embed>` tags.
- `javascript:` links.
- Inline event handlers such as `onclick=` or `onload=`.

## Preview before saving

If you have a browser or screenshot tool, preview your HTML on the live store before saving:

- Navbar: `{{STORE_URL}}/preview/chrome?part=navbar&html=<url-encoded HTML>`
- Footer: `{{STORE_URL}}/preview/chrome?part=footer&html=<url-encoded HTML>`

Omit `html` (or pass `html=`) to preview the built-in default template. Invalid HTML displays the validation error instead of rendering.

## Workflow

1. Call `GET {{BASE}}/chrome` to read the current `navbarHtml`, `footerHtml`, and `defaults`.
2. Edit the HTML you want to change. Keep the other field as returned, or pass `""` to reset a field to the built-in default.
3. Optional: open the preview URL above to inspect the rendered header or footer.
4. Call `PATCH {{BASE}}/chrome` with both `navbarHtml` and `footerHtml`.

Example request to update the footer while keeping the default navbar:

```json
{
	"navbarHtml": "",
	"footerHtml": "<footer class=\"border-t bg-background\"><div class=\"mx-auto max-w-7xl px-4 py-10 lg:px-8\"><div class=\"grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4\"><div class=\"space-y-2\"><a href=\"{{store.homeHref}}\" class=\"text-lg font-semibold\">{{store.name}}</a></div><store-categories /><div class=\"space-y-2\"><h3 class=\"text-sm font-semibold\">Quick Links</h3><ul class=\"space-y-1 text-sm text-muted-foreground\"><li><a href=\"{{store.homeHref}}\" class=\"hover:text-foreground\">Home</a></li><li><a href=\"{{store.cartHref}}\" class=\"hover:text-foreground\">Cart</a></li><li><a href=\"{{store.ordersHref}}\" class=\"hover:text-foreground\">My Orders</a></li><store-pages /></ul></div><store-contact /></div><div class=\"mt-8 border-t pt-4 text-center text-xs text-muted-foreground\">&copy; {{store.year}} {{store.name}}.</div></div></footer>"
}
```

Changes appear on the storefront within a few seconds.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Too long: use at most 50,000 characters.` | Shorten `navbarHtml` or `footerHtml` to 50,000 characters or fewer. |
| 400 `<script> is not allowed.` | Remove `<script>` tags. Use a `custom` block in `{{BASE}}/skill/pages` for scripted sections. |
| 400 `<iframe> is not allowed.` | Remove `<iframe>`, `<object>`, and `<embed>` tags. |
| 400 `javascript: links are not allowed.` | Replace `javascript:` URLs with store paths or `https://` links. |
| 400 `Inline event handlers (onclick=, onload=, ...) are not allowed.` | Remove all `on*=` attributes. |
| 400 `Required` or `Unrecognized key(s) in object` | Send an object with exact keys `navbarHtml` and `footerHtml` only. |
