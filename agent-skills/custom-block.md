# Custom component (`custom` block)

A `custom` block renders arbitrary HTML, Tailwind CSS, and JavaScript inside a sandboxed iframe on any store page (`home`, `category`, `product`, or custom pages). Use it when `carousel`, `productList`, and `markdown` blocks in `{{BASE}}/skill/pages` cannot build the layout you need. Router: `{{BASE}}/skill/index`.

Boundary: this skill is for page blocks, not the global navbar or footer (`{{BASE}}/skill/chrome`). Chrome restrictions do not apply here: `<script>`, `<style>`, and inline event handlers such as `onclick=` are allowed in a `custom` block.

## Before you write

1. Check whether `carousel`, `productList`, or `markdown` in `{{BASE}}/skill/pages` already solves the task.
2. Read the current page layout (`GET {{BASE}}/page-layouts/{page}`) and existing categories (`GET {{BASE}}/categories?page=1&pageSize=100`).
3. Test your `data` queries first with `GET {{BASE}}/page-layouts/data?data=...` (runs at once in both modes).
4. Place `html`, `data`, `height`, and `title` inside `settings`, never at the top level of the block.

## Endpoints

Custom components are saved inside a page's block array via `PUT {{BASE}}/page-layouts/{page}` (`{{BASE}}/skill/pages`).

| Method and path | Query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/page-layouts/data` | `?data=<url-encoded JSON>&categoryId=<opt>&productId=<opt>` | Live `STORE_DATA` object resolved by the storefront, or `400` / `413` / `502`. |

`data` query parameter max length is 20,000 characters. Note: `/page-layouts/data` returns `[]` for a `categoryId` that does not belong to this store, whereas `PUT /page-layouts/{page}` rejects it with `400`.

## Fields

Required block shape:

```json
{
	"type": "custom",
	"settings": {
		"title": "Optional admin label",
		"height": 400,
		"data": {},
		"html": "<div>...</div>"
	}
}
```

| Field | Type | Required | Default | Rules and limits |
| --- | --- | --- | --- | --- |
| `settings.html` | string | Yes | None | Self-contained HTML fragment, 1 to 300,000 characters (whole `PUT` request body max 400,000 characters). Do not write `<html>`, `<head>`, or `<body>`. Inline `<script>`, `<style>`, and remote links work. |
| `settings.title` | string | No | None | Admin-only label. |
| `settings.height` | integer | No | `400` | Initial height in pixels (`80` to `2000`) before the iframe finishes loading. The iframe auto-resizes to fit content up to 20,000 px. |
| `settings.data` | object | No | `{}` | Map of up to 10 named server queries resolved into `window.STORE_DATA`. |

## Sandbox and runtime limits

- Sandbox attributes: `allow-scripts allow-forms allow-popups`, with an opaque origin and `loading="lazy"`.
- Blocked by the browser sandbox: cookies, shopper auth, cart state, `localStorage`, store API fetches, and modal dialogs (`alert()`, `confirm()`, `prompt()` do nothing because `allow-modals` is off).
- Links starting with `/` navigate inside the store. Links starting with `http://` or `https://` open in a new tab. From JavaScript, call `STORE.open(path)` to navigate inside the store.

## Styling, Tailwind CSS, and fonts

The store page behind the iframe is white. The frame applies these defaults before your styles:

| Property | Default |
| --- | --- |
| Font on `body` | `Inter` (`--font-store`) |
| Text color on `body` | `#111827` (`--foreground`) |
| Background | Transparent (`--background` is `#ffffff`) |
| Extra CSS variables | `--muted` (`#6b7280`), `--border` (`#e5e7eb`) |
| Layout defaults | `body { margin: 0 }`, `box-sizing: border-box` on all elements, `img { max-width: 100% }` |

- **No Tailwind preflight**: headings, paragraphs, and lists keep default browser margins and font sizes. Set margins and text sizes explicitly (such as `m-0` and `text-2xl`).
- **Tailwind CSS v4 compilation**: any Tailwind v4 class name written literally in `html` (including inside `<script>` template strings) is compiled automatically. Do not build class names at runtime (`"text-" + size` will not compile). Store-only utility classes (such as `dshadow`) do not exist in the iframe. Breakpoints (`sm`, `md`, `lg`, `xl`) follow the iframe width.
- **Custom CSS and fonts**: `<style>` tags override Tailwind and frame defaults. Remote `<link rel="stylesheet">` tags and Google Fonts work directly. Custom `@font-face` files from other hosts need `Access-Control-Allow-Origin: *`, or the browser falls back to Inter.
- **Forbidden height units (`400`)**: the server rejects `vh`, `dvh`, `svh`, and `lvh` units (such as `h-[50vh]`) and the classes `h-screen`, `h-dvh`, `h-svh`, and `h-lvh` (including `min-` and `max-` variants) because viewport-height sizing causes an infinite resize loop. The check scans the entire `html` string, including prose and JS strings. Use `px`, `rem`, or `%` instead.
- **HTML entities in scripts**: `textContent` shows entities such as `&middot;` as literal text. In JavaScript strings, use escapes such as `'\u00B7'` and `'\u20B9'`, or set `innerHTML`.

## Data queries (`data` and `STORE_DATA`)

Each key in `data` becomes an array on global `STORE_DATA` (also `window.STORE_DATA`).

- At most 10 queries per block.
- Query names must match `^[A-Za-z_][A-Za-z0-9_]{0,31}$` (start with a letter or `_`, max 32 chars).
- Reserved names: `store` on every page, `category` on the `category` page, and `product` on the `product` page.

| `source` | Query keys (default) | Returned item fields |
| --- | --- | --- |
| `"products"` | `categoryId` (id or `"current"`), `featuredOnly` (`false`), `search` (see Search syntax in `{{BASE}}/skill/pages`), `limit` `1` to `50` (`12`) | `{ id, name, price, priceText, image, images, url, category: { id, name }, featured, inStock, quantity, description }` |
| `"categories"` | None | `{ id, name, image, url }` |

### Data rules and limits

- **Query product items carry one image and `description: null`**: `products` queries read the list endpoint, so `images` contains only the first image (800 px Cloudinary URL) and `description` is always `null`. Only `STORE_DATA.product` on the `product` page includes all images and `description`. On other pages, link cards to `p.url` (their product page), or tell the user about this limit.
- **Stock and archiving**: archived products are never returned. Out-of-stock products are included (`inStock: false`, `quantity: 0`). Result order is not guaranteed.
- **Prices**: `price` is a number in rupees or `null` for quote-only products. `priceText` is the formatted rupee string or the store's `quote.priceText` label.
- **Automatic context**: `STORE_DATA.store` is `{ name, home }` and is always present. It has no phone, WhatsApp, email, or address. Read `GET {{BASE}}/contact` and write them into `html` directly. On `category`, `STORE_DATA.category` is `{ id, name, image, url }` (400 px image). On `product`, `STORE_DATA.product` is the current product item.
- **200,000-byte cap**: if resolved data exceeds 200,000 bytes, `STORE_DATA.error` explains the overrun and all query arrays are omitted. Always guard arrays in JavaScript with `(STORE_DATA.deals || [])`.
- On a `product` page, a `"products"` query with `"categoryId": "current"` includes the current product, so filter out `STORE_DATA.product.id` in your script (a `productList` block excludes it automatically).

## Preview before saving

1. **Test data**: call `GET {{BASE}}/page-layouts/data?data=<url-encoded JSON>`. Add `&categoryId=<id>` for `category` pages or `&productId=<id>` for `product` pages.
2. **Visual preview (with a browser)**: open `{{STORE_URL}}/preview/section?page=<home|category|product|custom>&section=<url-encoded block JSON>` (add `&categoryId=` or `&productId=` when needed). Include `"id": "preview-1"` in the block JSON. Placeholder `https://` image URLs (such as `https://placehold.co/800x600.png`) work during preview; replace them with real URLs before `PUT`.
3. **Without a browser**: verify the data from step 1, keep the HTML simple, tell the user you could not render a visual preview, and ask them to check the live page after saving.

## Example

Block object for `PUT {{BASE}}/page-layouts/summer-sale` (a custom page showing up to 6 products under 2,000 rupees):

```json
{
	"type": "custom",
	"settings": {
		"title": "Summer deals",
		"height": 360,
		"data": {
			"deals": {
				"source": "products",
				"search": "under 2000",
				"limit": 6
			}
		},
		"html": "<div id=\"deals\" class=\"grid grid-cols-2 gap-4 p-4 md:grid-cols-3\"></div><script>const items = STORE_DATA.deals || []; document.getElementById('deals').innerHTML = items.map(function (p) { return '<a class=\"block text-inherit no-underline\" href=\"' + p.url + '\"><img class=\"aspect-square w-full rounded-xl object-cover\" src=\"' + (p.image || '') + '\"><div class=\"mt-2 text-sm\">' + p.name + '</div><b class=\"text-base\">' + p.priceText + '</b></a>'; }).join('');</script>"
	}
}
```

## Steps

1. Design the `data` queries and test them with `GET {{BASE}}/page-layouts/data?data=...`.
2. Write the `html` fragment with literal Tailwind classes, `(STORE_DATA.<name> || [])` guards, and no `vh` or `h-screen` units.
3. Optional: inspect the rendered block with `/preview/section` (include `"id"`).
4. Read `GET {{BASE}}/page-layouts/{page}` and send `PUT {{BASE}}/page-layouts/{page}` with the `custom` block in the array (`{{BASE}}/skill/pages`).
5. Verify on the live storefront page.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `HTML is required` / `HTML is too large (300,000 characters at most; an agent request is capped at 400 KB)` | Send non-empty `settings.html` within size limits. |
| `400` | `Do not use vh units (or the h-screen and dvh classes): the frame is sized to the content. Use px, rem or %.` | Remove every `vh`, `dvh`, `svh`, `lvh`, `h-screen`, `h-dvh`, `h-svh`, `h-lvh` string from `html`. |
| `400` | `Data names: letters, digits, _ (start with a letter, 32 at most)` | Rename the query key to match `[A-Za-z_][A-Za-z0-9_]{0,31}`. |
| `400` | `The data name "store" is reserved` / `The data name "product" is filled in by the product page itself` | Rename the query key. |
| `400` | `At most 10 data queries` | Combine or remove queries so `data` has at most 10 keys. |
| `400` | `data is too long` (on `/page-layouts/data`) | Keep the `data` query parameter under 20,000 characters. |
| `413` | `The data is ... bytes, more than the 200000 allowed.` | Lower query `limit` values or remove queries. |
| `502` | `Could not reach the store. Try again.` (on `/page-layouts/data`) | Retry once; if it persists, tell the user the storefront preview endpoint is unreachable. |

## Related skills

| When you need to | Read |
| --- | --- |
| Save page layouts, create custom pages, or read Search syntax rules | `{{BASE}}/skill/pages` |
| Edit the global navbar and footer HTML (different rules) | `{{BASE}}/skill/chrome` |
| Upload images for use inside `html` | `{{BASE}}/skill/media` |
