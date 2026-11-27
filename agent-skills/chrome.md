# Navbar and footer (chrome)

`navbarHtml` and `footerHtml` render directly in the server-rendered page on every route of the store. Edit them as plain HTML with Tailwind CSS v4 classes, readymade `<store-* />` tags, and `{{variable}}` placeholders. Router: `{{BASE}}/skill/index`.

Boundary: chrome has no iframe and allows no JavaScript. For interactive or scripted page sections, use a `custom` component in `{{BASE}}/skill/custom-block` instead (chrome restrictions do not apply there).

## Before you write

1. Always call `GET {{BASE}}/chrome` first.
2. Warning: `PATCH {{BASE}}/chrome` requires **both** `navbarHtml` and `footerHtml`. Sending `""` **resets** that part to the built-in default template and erases any custom HTML. To keep a part unchanged, send back the exact string returned by `GET {{BASE}}/chrome`.
3. Warning: the store layout always reserves 64 px (`pt-16`) at the top for a **fixed** navbar. Keep your `<header>` fixed at the top (`fixed top-0 w-full z-20`) and at most 64 px tall, or it will overlap page content. `/preview/chrome` forces the navbar to static positioning, so it hides height or overlap bugs; verify on the live storefront after saving.
4. Warning: `defaults.navbarHtml` and `defaults.footerHtml` start with an HTML comment that lists the readymade tags. The server drops comments with their content, so place new elements inside `<header>` or `<footer>`, never inside `<!-- ... -->`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/chrome` | None | `{ navbarHtml, footerHtml, defaults: { navbarHtml, footerHtml } }`. Returns `""` when a part uses the built-in default (or when stored HTML is invalid and falls back to the default). |
| `PATCH {{BASE}}/chrome` | `{ navbarHtml, footerHtml }` | `{ navbarHtml, footerHtml, defaults: { navbarHtml, footerHtml } }`. |

Errors use `{ "error": { "code", "message", "details" } }`.

## Fields

| Field | Type | Required | Rules and limits | Meaning of `""` on PATCH |
| --- | --- | --- | --- | --- |
| `navbarHtml` | string | Yes | Max 50,000 characters. No blocked HTML below. | Resets the navbar to the built-in default template. Does **not** mean "leave unchanged". |
| `footerHtml` | string | Yes | Max 50,000 characters. No blocked HTML below. | Resets the footer to the built-in default template. Does **not** mean "leave unchanged". |

Unknown keys return `400`.

## Readymade tags

Always self-close every tag (`<store-cart />` or `<store-cart></store-cart>`). An unclosed tag such as `<store-cart>` swallows every sibling element after it.

Each tag works **only** in its own part. Placing a footer tag inside `navbarHtml` (or a navbar tag inside `footerHtml`) renders nothing and returns no error.

### Navbar-only tags

| Tag | Renders |
| --- | --- |
| `<store-logo />` | Store logo and name (from `{{BASE}}/skill/branding`), linked to home. |
| `<store-search />` | Live product search bar. |
| `<store-cart />` | Cart button with live item count. |
| `<store-account />` | Sign-in button or customer account menu. |

### Footer-only tags

| Tag | Renders |
| --- | --- |
| `<store-categories />` | Categories column with links to each category. Omitted when there are no categories. |
| `<store-pages />` | `<li>` link items for each custom page (place inside a `<ul>`). Link text is derived automatically from each route (such as `summer-sale` to `Summer sale`). Omitted when there are no custom pages. |
| `<store-contact />` | Contact column with Call and WhatsApp links (from `{{BASE}}/skill/contact`). Omitted when both phone and WhatsApp are unset. |

## Data variables

Write variables as `{{name}}`. The server replaces them before HTML parsing (so they work in attributes too) and HTML-escapes every value. Unknown variables render as empty text. There is no conditional or loop syntax (`#if`, `#each`).

| Variable | Value |
| --- | --- |
| `{{store.name}}` | Store name (`{{BASE}}/skill/branding`). |
| `{{store.year}}` | Current 4-digit year. |
| `{{store.homeHref}}` | Home page path. |
| `{{store.cartHref}}` | Cart page path. |
| `{{store.ordersHref}}` | Customer orders page path. |
| `{{contact.phone}}` | Store phone, or empty if unset (`{{BASE}}/skill/contact`). |
| `{{contact.whatsapp}}` | Store WhatsApp digits with country code (ready for `https://wa.me/{{contact.whatsapp}}`), or empty if unset. |

`{{contact.email}}` and `{{contact.address}}` do not exist and render as empty text.

## Rendering, blocked HTML, and dropped markup

- **Tailwind CSS v4**: the server compiles every Tailwind v4 class in your saved HTML. Internal links starting with `/` use client-side navigation and keep the store base path automatically.
- **Blocked with `400` (scanned across the entire HTML string, including visible text)**:
  - `<script`, `<iframe`, `<object`, `<embed`
  - `javascript:` (even inside visible prose such as `"Learn JavaScript: basics"`)
  - Inline event handlers matching `on<letters>=` (such as `onclick=`, `onload=`, or even stray text like ` one=`)
- **Silently dropped at render time**:
  - Tags dropped with their content: `<style>`, `<link>`, `<meta>`, `<base>`, `<noscript>`, `<template>`, `<title>`, `<foreignobject>`, and HTML comments.
  - Inline `style="..."` declarations containing `url(`, `expression(`, or `@import` (so CSS background images do not work; use `<img>`).
  - Form attributes `action` and `method` (so `<form>` cannot submit; use `<store-search />`).

## Preview before saving

If you have a browser or screenshot tool, preview your HTML before saving:

- Navbar: `{{STORE_URL}}/preview/chrome?part=navbar&html=<url-encoded HTML>`
- Footer: `{{STORE_URL}}/preview/chrome?part=footer&html=<url-encoded HTML>`

Omit `html` to preview the built-in default.

## Examples

### Add a navbar link

When `GET` returns `navbarHtml: ""`, start from `defaults.navbarHtml` without its leading comment. Add the link inside the inner `<div>`.

```json
{
	"navbarHtml": "<header class=\"border-b z-20 fixed w-full glass top-0\"><div class=\"mx-auto max-w-7xl\"><div class=\"h-[3.1rem] lg:h-[3.25rem] relative px-3 lg:px-8 flex items-center gap-2 sm:gap-3\"><store-logo /><store-search /><a href=\"/summer-sale\" class=\"text-sm font-medium whitespace-nowrap\">Sale</a><div class=\"flex items-center gap-4\"><store-cart /><store-account /></div></div></div></header>",
	"footerHtml": "<exact footerHtml string from GET /chrome>"
}
```

### Change only the footer while keeping the current navbar unchanged

Pass `navbarHtml` byte-for-byte as returned by `GET {{BASE}}/chrome` (whether it is `""` for the default or custom HTML).

```json
{
	"navbarHtml": "<exact navbarHtml string from GET /chrome>",
	"footerHtml": "<footer class=\"border-t bg-background\"><div class=\"mx-auto max-w-7xl px-4 py-10 lg:px-8\"><div class=\"grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4\"><div class=\"space-y-2\"><a href=\"{{store.homeHref}}\" class=\"text-lg font-semibold\">{{store.name}}</a></div><store-categories /><div class=\"space-y-2\"><h3 class=\"text-sm font-semibold\">Quick Links</h3><ul class=\"space-y-1 text-sm text-muted-foreground\"><li><a href=\"{{store.homeHref}}\" class=\"hover:text-foreground\">Home</a></li><li><a href=\"{{store.cartHref}}\" class=\"hover:text-foreground\">Cart</a></li><li><a href=\"{{store.ordersHref}}\" class=\"hover:text-foreground\">My Orders</a></li><store-pages /></ul></div><store-contact /></div><div class=\"mt-8 border-t pt-4 text-center text-xs text-muted-foreground\">&copy; {{store.year}} {{store.name}}.</div></div></footer>"
}
```

### Reset only the footer to the built-in default

```json
{
	"navbarHtml": "<exact navbarHtml string from GET /chrome>",
	"footerHtml": ""
}
```

## Steps

1. Call `GET {{BASE}}/chrome` and copy both `navbarHtml` and `footerHtml` (and inspect `defaults` if you want a starting template).
2. Edit only the part the user asked to change. Keep the other part byte-identical to what `GET` returned.
3. Optional: inspect the rendered result with `/preview/chrome`.
4. Send `PATCH {{BASE}}/chrome` with both `navbarHtml` and `footerHtml`.
5. Verify on the live storefront `{{STORE_URL}}` (especially navbar height and overlap on mobile and desktop).

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Too long: use at most 50,000 characters.` | Shorten the HTML to 50,000 characters or fewer. |
| `400` | `<script> is not allowed.` | Remove `<script>`. Use `{{BASE}}/skill/custom-block` for scripted page sections. |
| `400` | `<iframe> is not allowed.` / `<object> is not allowed.` / `<embed> is not allowed.` | Remove those tags. |
| `400` | `javascript: links are not allowed.` | Remove `javascript:` from links and visible text. |
| `400` | `Inline event handlers (onclick=, onload=, ...) are not allowed.` | Remove `on*=` attributes and text matching `on<letters>=`. |
| `400` | `Required` / `Unrecognized key(s) in object` | Send an object with exact keys `navbarHtml` and `footerHtml` only. |

## Related skills

| When you need to | Read |
| --- | --- |
| Build a scripted or interactive page section | `{{BASE}}/skill/custom-block` |
| Change store name, logo, `logoOnly`, or favicon | `{{BASE}}/skill/branding` |
| Change phone or WhatsApp shown by `<store-contact />` and `{{contact.*}}` | `{{BASE}}/skill/contact` |
| Upload images used inside `<img>` tags | `{{BASE}}/skill/media` |
