# Pages: layouts and custom pages

Each store page is an ordered array of blocks. The store has three built-in pages (`home`, `category`, `product`) and up to 30 custom pages at `{{STORE_URL}}/<route>`. Router: `{{BASE}}/skill/index`.

For `custom` components (HTML, Tailwind CSS, JavaScript, and `STORE_DATA` queries), read `{{BASE}}/skill/custom-block`. For the global navbar and footer, read `{{BASE}}/skill/chrome`.

## Before you write

1. Call `GET {{BASE}}/page-layouts` to see existing custom routes.
2. Call `GET {{BASE}}/page-layouts/{page}` before editing any page. `PUT` replaces the entire block array. If a built-in page returns `null`, start from its default layout below so you do not wipe built-in blocks.
3. Warning: never `PUT []` on a built-in page to reset it to defaults. Saving `[]` renders a blank page. Confirm with the user before removing blocks or deleting a custom page.
4. Collect any `categoryId` (`GET {{BASE}}/categories?page=1&pageSize=100`) and image URLs (`{{BASE}}/skill/media`) you need.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/page-layouts` | None | `{ pages: ["home", "category", "product"], custom: ["<route>", ...] }` (sorted). |
| `POST {{BASE}}/page-layouts` | `{ "route": "summer-sale" }` | `201` `{ route, blocks: [] }`. Creates an empty custom page. |
| `GET {{BASE}}/page-layouts/{page}` | None | Saved block array, `null` (built-in page using defaults), or `404` (missing custom page). |
| `PUT {{BASE}}/page-layouts/{page}` | Array of blocks | Normalized saved array with generated `id` and default settings filled in. |
| `DELETE {{BASE}}/page-layouts/{route}` | None | `{ deleted: "<route>" }`. Custom pages only. |

`{page}` is `home`, `category`, `product`, or the normalized lowercase custom route without a leading `/`. There is no `PATCH`. Every category shares the `category` layout, and every product shares the `product` layout.

In permission mode, invalid page-layout writes fail at once with `400`, `404`, or `409` instead of returning `202`. When a layout validation fails in permission mode, the response is `{ "error": "{\"error\":\"Invalid layout\",\"issues\":[...]}" }`.

## Default layouts (when GET returns null)

| Page | Default blocks |
| --- | --- |
| `home` | `[ { "type": "categories", "settings": {} } ]` |
| `category` | `[ { "type": "categoryBanner", "settings": {} }, { "type": "categoryProducts", "settings": {} } ]` |
| `product` | `[ { "type": "productTop", "settings": {} }, { "type": "productDescription", "settings": {} }, { "type": "relatedProducts", "settings": { "title": "Related Items" } } ]` |

## Block types and allowed pages

Content blocks hold their own content and can appear any number of times on any page. Fixed blocks display the store's own records, can appear at most once, and work only on their own built-in page. Keep `categoryProducts` and `productTop` unless the owner asks to remove them.

| `type` | Name | Allowed pages | Kind | What it shows | Where to edit its content |
| --- | --- | --- | --- | --- | --- |
| `carousel` | Billboard | All, custom too | Content | Image slideshow with optional click links | Block `settings` below |
| `productList` | Product list | All, custom too | Content | Filtered products as cards or image tiles | Block `settings` below and `{{BASE}}/skill/products` |
| `markdown` | Markdown | All, custom too | Content | Formatted text, tables, lists, links, images | Block `settings.markdown` |
| `custom` | Custom component | All, custom too | Content | Sandboxed HTML, Tailwind CSS, and JavaScript | `{{BASE}}/skill/custom-block` |
| `categories` | Category icons | `home` | Fixed | Every category's name and thumbnail | `{{BASE}}/skill/categories` (`name`, `imageUrl`) |
| `categoryBanner` | Category billboard | `category` | Fixed | Current category's billboard images | Images: `{{BASE}}/skill/categories` (`banner`). Display settings: block `settings` below. |
| `categoryProducts` | Category filters and product grid | `category` | Fixed | Current category's filters and products | `{{BASE}}/skill/products`, `{{BASE}}/skill/filters` |
| `productTop` | Product details | `product` | Fixed | Product images, name, price, quantity, buy buttons | `{{BASE}}/skill/products` |
| `productDescription` | Product description | `product` | Fixed | Product's Markdown description (hidden if empty) | `{{BASE}}/skill/products` (`description`) |
| `relatedProducts` | Related products | `product` | Fixed | Up to 8 in-stock items from the same category (scanned from the first 20 by id) | Block `settings.title` only (default `"Related Items"`) |

Array order is top-to-bottom page order. `id` is optional on `PUT` (the server generates one), and unknown keys inside `settings` are stripped.

## Fields

### `carousel` (Billboard) and `categoryBanner` (Category billboard)

`categoryBanner` accepts the same display settings as `carousel`, except `title` and `images`. A `carousel` block placed on the `category` layout displays the same images on **every** category page; for per-category billboard images, edit each category's `banner` in `{{BASE}}/skill/categories` and configure display settings on `categoryBanner` here. (`categoryBanner` can sit beside a `carousel` on the `category` layout.)

| Setting | Type | Required | Default | Rules and meaning |
| --- | --- | --- | --- | --- |
| `images` (`carousel` only) | array | Yes | None | 1 to 20 `{ url, href, width?, height? }` objects. `url` starts with `http://` or `https://` (no spaces, max 2000 chars). `href` is a store path, full URL, or `""`. Optional positive integers `width` and `height` (up to 20,000) prevent layout shift when using natural shape. |
| `title` (`carousel` only) | string | No | None | Optional heading above the Billboard. |
| `slides` | integer | No | `1` | Number of slides visible side-by-side at once (`1` to `3`), independent of how many items are in `images`. |
| `aspectRatio` | object | No | `{ "desktop": "2.4:1", "mobile": "2:1" }` | `{ desktop?, mobile? }`. Each value is `"W:H"` with width/height between `0.3:1` and `8:1` (`desktop` `>= 768px`, `mobile` `< 768px`). **Omitting `aspectRatio` applies the `2.4:1` / `2:1` default.** Pass `"aspectRatio": {}` to use each image's natural shape on both devices, or omit only `desktop` or `mobile` inside the object to use natural shape on that device. |
| `fill` | boolean | No | `false` | When a ratio is set: `true` fills the box with `object-cover` (may crop); `false` centers the full image inside the ratio box without cropping. |
| `fullWidth` | boolean | No | `false` | `true` stretches edge to edge across the screen width with no side padding. |
| `rounded` | boolean | No | `true` | `true` rounds the image corners. Set `false` for true edge-to-edge full-width banners. |
| `autoplay` | boolean | No | `true` | Automatically advances slides. |

### `productList` (Product list)

| Setting | Type | Required | Default | Rules and meaning |
| --- | --- | --- | --- | --- |
| `title` | string | Yes | None | Non-empty heading. |
| `categoryId` | string | No | None | A category id from this store, or `"current"`. |
| `featuredOnly` | boolean | No | `false` | Show only featured products. |
| `search` | string | No | None | Store search text (see Search syntax below). |
| `limit` | integer | No | `8` | `1` to `24`. Out-of-stock products are included. |
| `grid` | boolean | No | `false` | `false` shows product cards; `true` shows image tiles. |
| `columns` | integer | No | `2` | Used when `grid` is `true`: `2` or `3`. |
| `showName` | boolean | No | `true` | Used when `grid` is `true`. |
| `showPrice` | boolean | No | `false` | Used when `grid` is `true`. |

`"categoryId": "current"` means the category of the current page. On `category`, it matches the displayed category. On `product`, it matches the product's category and excludes the product itself. On `home` and custom pages, it applies no category filter.

### `markdown` (Markdown) and fixed blocks

| Block | Setting | Rules |
| --- | --- | --- |
| `markdown` | `markdown` (required) | Non-empty GitHub Markdown, max 100,000 characters. Write headings in the Markdown (such as `## Returns`). Raw HTML is sanitized (scripts, iframes, and event handlers are removed). |
| `relatedProducts` | `title` (optional) | Non-empty string, default `"Related Items"`. |
| `categories`, `categoryProducts`, `productTop`, `productDescription` | None | Send `"settings": {}`. |

## Search syntax

Both `productList.search` and `custom` product queries (`{{BASE}}/skill/custom-block`) use the store search parser:

- **Price bounds are inclusive**: `under N`, `below N`, and `less than N` mean `<= N`. `above N`, `more than N`, and `greater than N` mean `>= N`. Optional `₹`, `Rs.`, and commas work (`"under ₹20,000"` and `"under 20000"` both match a 20,000 rupee item).
- **No shorthand suffixes**: do not write `k` (such as `"under 2k"`, which parses as `<= 2`).
- **Avoid `over` and `between`**: the parser drops those words and leaves the number as name text. Use `"above 20000"` instead of `"over 20000"`.
- **Quote items excluded**: any price phrase drops products with `price: null`.
- **Remaining words**: matched as one case-insensitive substring of the product name.
- **Hardcoded category words**: only five category keywords (`Laptops`, `Watch`, `TV`, `Audio`, `Smartphones`) auto-map to matching category names. Prefer setting `categoryId` directly instead of relying on category words in `search`.

## Custom page route rules

- Send `{ "route": "summer-sale" }` to `POST {{BASE}}/page-layouts`. No other key is allowed.
- One segment only (no `/`), lowercase letters, digits, and single hyphens, max 40 characters. `POST` trims spaces and slashes and lowercases the input, but `PUT` and `DELETE` do **not** normalize routes. Always pass the normalized lowercase route to `PUT` and `DELETE`.
- Reserved routes refused with `400`: `home`, `cart`, `category`, `product`, `products`, `search`, `checkout`, `orders`, `user-profile`, `sign-in`, `sign-up`, `preview`, `api`, `s`, `data`, `custom`.
- Duplicate routes return `409`. A store can have at most 30 custom pages.
- Custom pages accept only `carousel`, `productList`, `markdown`, and `custom` blocks. Fixed blocks return `400`.
- To rename a route, create the new page, `PUT` its blocks, confirm with the user, then delete the old route.

## Preview a block before saving

If you have a browser or screenshot tool, preview any single block on the live store before sending `PUT`:

`{{STORE_URL}}/preview/section?page=<home|category|product|custom>&section=<url-encoded block JSON>`

- Include an `"id"` field in the preview JSON (such as `"id": "preview-1"`). Without `"id"`, the preview shows an error even though `PUT` adds ids itself.
- For `page=category`, add `&categoryId=<id>`. For `page=product`, add `&productId=<id>`.
- Any `https://` image URL works in `/preview/section`, so you can preview a Billboard layout with placeholder URLs (such as `https://placehold.co/1600x667.png`) before uploading real assets. Upload and replace them with real URLs before `PUT`. Never save placeholder URLs to a live page.
- Preview checks one block in isolation. It does not check store ownership of `categoryId`, duplicate fixed blocks, or page-reserved data names.

## Examples

### Add a Markdown block below category icons on a default home page

When `GET {{BASE}}/page-layouts/home` returns `null`, keep the default `categories` block and send `PUT {{BASE}}/page-layouts/home`:

```json
[
	{ "type": "categories", "settings": {} },
	{
		"type": "markdown",
		"settings": {
			"markdown": "## Returns policy\n\nReturn any item within **7 days** in original packaging."
		}
	}
]
```

### Make category billboards full-width using natural aspect ratio (no cropping)

Send `PUT {{BASE}}/page-layouts/category` keeping `categoryProducts` and any other existing blocks:

```json
[
	{
		"type": "categoryBanner",
		"settings": {
			"slides": 1,
			"aspectRatio": {},
			"fill": false,
			"fullWidth": true,
			"rounded": false,
			"autoplay": true
		}
	},
	{ "type": "categoryProducts", "settings": {} }
]
```

### Add a Billboard and a Product list on a custom page

After `POST {{BASE}}/page-layouts` with `{ "route": "summer-sale" }` succeeds, send `PUT {{BASE}}/page-layouts/summer-sale`:

```json
[
	{
		"type": "carousel",
		"settings": {
			"title": "Summer offers",
			"images": [
				{ "url": "https://res.cloudinary.com/.../hero.jpg", "href": "/category/<id>" }
			],
			"slides": 1,
			"aspectRatio": { "desktop": "2.4:1", "mobile": "2:1" },
			"fill": false,
			"fullWidth": false,
			"rounded": true,
			"autoplay": true
		}
	},
	{
		"type": "productList",
		"settings": {
			"title": "Under Rs 20,000",
			"search": "under 20000",
			"limit": 8,
			"grid": false
		}
	}
]
```

## Steps

### Edit an existing page layout

1. Call `GET {{BASE}}/page-layouts/{page}`. If `null` on a built-in page, start from its default layout.
2. Modify, add, or reorder blocks in the array while keeping untouched blocks intact.
3. Optional: preview new or changed blocks with `/preview/section` (include `"id"`).
4. Send `PUT {{BASE}}/page-layouts/{page}` with the full array.
5. Verify with the `PUT` response (or `GET {{BASE}}/page-layouts/{page}`) and on the storefront.

### Create a custom page

1. Call `GET {{BASE}}/page-layouts` and check the route is not in `custom`.
2. Send `POST {{BASE}}/page-layouts` with `{ "route": "<route>" }`. In permission mode, wait for approval before step 3.
3. Send `PUT {{BASE}}/page-layouts/<route>` with the block array.
4. Verify at `{{STORE_URL}}/<route>`.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Unknown field "x". Send { "route": "summer-sale" }.` | Send only `{ "route": "..." }` to `POST /page-layouts`. |
| `400` | `Enter a route, for example summer-sale` / `Use 40 characters at most` / `Use lowercase letters, digits and hyphens only. For example: summer-sale` | Fix the route format: one segment, lowercase letters, digits, single hyphens, max 40 chars. |
| `400` | `/... is used by the store itself. Pick another route.` | Choose a non-reserved route. |
| `400` | `A store can have 30 custom pages at most. Delete one first.` | Confirm with the user and delete an unused custom page first. |
| `400` | `The ... page cannot be deleted.` | Built-in pages cannot be deleted. Do not save `[]` unless the user wants a blank page. |
| `400` | `Invalid layout` with `issues[]` | Read `issues[].path` and `issues[].message`. Common causes: empty `carousel.images`, bad image URL, `aspectRatio` outside `0.3:1` to `8:1`, missing `productList.title`, empty `markdown`, fixed block on wrong page, or duplicate fixed block. |
| `400` | `Category not found in this store` | Replace or remove the invalid or deleted `categoryId` in every block on the page (often caused by deleting a category before updating page layouts; see `{{BASE}}/skill/categories`). |
| `404` | `No page at /...` | Create the custom page with `POST /page-layouts` first, or use the exact lowercase route. |
| `409` | `/... is already a page of this store. Pick another route.` | Pick another route, or `PUT` blocks to the existing route. |

## Related skills

| When you need to | Read |
| --- | --- |
| Write a `custom` component (HTML, CSS, JavaScript, `STORE_DATA`) | `{{BASE}}/skill/custom-block` |
| Edit category billboard images (`banner`) or thumbnails (`imageUrl`) | `{{BASE}}/skill/categories` |
| Edit site-wide navbar and footer HTML | `{{BASE}}/skill/chrome` |
| Upload or pick images for Billboards and Markdown | `{{BASE}}/skill/media` |
| Edit products shown by `productList` or `categoryProducts` | `{{BASE}}/skill/products` |
