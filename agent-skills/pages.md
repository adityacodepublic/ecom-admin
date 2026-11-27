# Pages: layouts and custom pages

Each store page is a list of blocks in the order the owner chose. The store has three built-in pages: the home page, the category page and the product page. The owner can also add custom pages, each at its own route such as `/summer-sale`. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/page-layouts` | `{ pages: ["home", "category", "product"], custom: ["<route>", ...] }`. The routes of the custom pages, sorted. |
| `POST {{BASE}}/page-layouts` | Body `{ "route": "summer-sale" }`. Creates an empty custom page. Returns 201 `{ route, blocks: [] }`. |
| `GET {{BASE}}/page-layouts/{page}` | The saved array. A built-in page with no saved layout returns `null`, and the page shows its default (see "Defaults"). |
| `PUT {{BASE}}/page-layouts/{page}` | The saved array. Replaces the whole layout of that page. |
| `DELETE {{BASE}}/page-layouts/{route}` | Deletes a custom page and its blocks. Returns `{ deleted: "<route>" }`. |
| `GET {{BASE}}/page-layouts/data?data=...` | Test a `custom` block's data queries (see "Try it before saving"). |

`{page}` is `home`, `category`, `product`, or the route of a custom page without the leading `/`. Every category page uses the category layout, and every product page uses the product layout. `PATCH` does not exist. To change one block, GET the array, edit it, and PUT the whole array. Do not `PUT []` on a built-in page. It saves an empty page and does not restore the default. The built-in pages cannot be deleted.

## Custom pages

A custom page is a store page at `{{STORE_URL}}/<route>`. It holds only the content blocks: `carousel`, `productList`, `markdown` and `custom`. Fixed blocks are refused there.

1. `GET {{BASE}}/page-layouts` and check that the route is not in `custom`.
2. `POST {{BASE}}/page-layouts` with `{ "route": "summer-sale" }`. The new page is empty and shows nothing yet.
3. `PUT {{BASE}}/page-layouts/summer-sale` with the blocks.

Route rules:

- One part only, with no `/` inside. Use lowercase letters, digits and single hyphens, up to 40 characters. The server trims spaces and slashes and lowercases the route, so `/Summer-Sale/` becomes `summer-sale`.
- These routes belong to the store and are refused: `home`, `cart`, `category`, `product`, `products`, `search`, `checkout`, `orders`, `user-profile`, `sign-in`, `sign-up`, `preview`, `api`, `s`, `data` and `custom`.
- A route that another custom page has is refused with 409.
- A store has 30 custom pages at most.

In permission mode, a create, save or delete that would fail is refused at once with its error. It does not wait for the owner. A request that passes these checks still waits for the owner.

To change a route, create the new page, PUT the blocks there, then delete the old page. Links to the old route stop working, so confirm with the user first. `"categoryId": "current"` on a custom page applies no category filter, as on the home page.

## Two kinds of blocks

Content blocks (`carousel`, `productList`, `markdown`, `custom`) keep everything they show in their own `settings`. Every page can use them, any number of times.

Fixed blocks show the store's own data: the categories, the category being shown, or the product being shown. That data is not in the layout, so this endpoint cannot change it. You choose only whether a fixed block appears and where. Each fixed block can appear once per page, and only on its own page. A second copy, or a fixed block on another page, returns a 400 error. A fixed block you leave out is not shown. Keep `categoryProducts` and `productTop` unless the owner asks to remove them.

### Block types and where they work

| Block `type` | Pages | Kind | What it shows | Change its content with |
| --- | --- | --- | --- | --- |
| `carousel` ("Billboard") | all, custom pages too | content | Images in order, each with an optional click target. | Its settings: `images`, `title`, `slides`, `sizeMode`, `height`, `fullWidth`, `contain`, `autoplay`. |
| `productList` ("Product list") | all, custom pages too | content | Products chosen by category, featured flag and search words, as cards or as a grid of image tiles. | Its settings (see "Block settings"). For the products themselves, see `{{BASE}}/skill/products`. |
| `markdown` ("Markdown") | all, custom pages too | content | Formatted text: headings, lists, links, images, tables and quotes, styled like a product description. | Its setting: `markdown`. |
| `custom` ("Custom block") | all, custom pages too | content | Your own HTML, Tailwind CSS, and JavaScript inside a sandboxed iframe. | Its settings: `html`, `data`, `height`, `title`. |
| `categories` ("Category icons") | home | fixed | Every category's name and Thumbnail. | Categories: `name`, `imageUrl` (the Thumbnail). `{{BASE}}/skill/categories` |
| `categoryBanner` ("Category billboard") | category | fixed | The images of the category being shown. | That category's `banner`. `{{BASE}}/skill/categories` |
| `categoryProducts` ("Category filters and product grid") | category | fixed | The filters and the products of the category being shown. | Products (`categoryId`, `filteritems`) and filters. `{{BASE}}/skill/products`, `{{BASE}}/skill/filters` |
| `productTop` ("Product details") | product | fixed | Image carousel, name, price, quantity and the buy buttons of the product being shown. | That product's `images`, `name`, `price`, `quantity`, `maxQuantity`. `{{BASE}}/skill/products` |
| `productDescription` ("Product description") | product | fixed | The product's Markdown description. It shows nothing when the product has none. | That product's `description`. `{{BASE}}/skill/products` |
| `relatedProducts` ("Related products") | product | fixed | Up to 8 other in-stock products of the same category. It shows nothing when there are none. | The block sets only `title` (default `"Related Items"`). The product's category decides which products show. |

For text, such as an announcement, a size guide or a returns policy, use a `markdown` block. When no block can show what a design needs, write a `custom` block.

### Block settings

Array order is page order, top to bottom. `id` is optional, and the server adds one. The server drops settings keys that this table does not list.

| Block | Settings (default) |
| --- | --- |
| `carousel` | `images` required: 1 to 20 `{ url, href, width?, height? }` in order (`width`/`height` optional natural px dimensions for 0-CLS in `natural` mode). `url` is an `http(s)` image link. `href` is where a click goes: a store path such as `/category/<id>`, a full URL, or `""` for nowhere. `title` optional. `slides` shown at once, 1 to 3 (1). `sizeMode`: `"cover"` (standard responsive banner, default), `"natural"` (keeps each image's natural aspect ratio with rounded corners, capped at `76vh`), or `"fixed"` (uses `height`). `height`: 160 to 900 px (400), used when `sizeMode` is `"fixed"`. `fullWidth` (false): stretches edge to edge across the full screen width with no side padding or rounded corners. `contain` shows the whole image with no crop in `cover`/`fixed` modes (false). `autoplay` (true). |
| `productList` | `title` required, non-empty. `categoryId` optional: a category id or `"current"`. `featuredOnly` (false). `search` optional: the same words as the store search box, and it understands "under 20000". `limit` 1 to 24 (8). `grid` (false): false shows product cards (image, name, price), true shows big image tiles. Only for `grid: true`: `columns` 2 or 3 (2), `showName` (true), `showPrice` (false). |
| `markdown` | `markdown` required: GitHub Markdown, up to 100,000 characters. Tables, task lists and strikethrough work. Raw HTML is allowed but cleaned, so scripts, iframes and event handlers are removed. Images are `![alt](https://...)` links, such as those from `GET {{BASE}}/media`. Write any heading in the text itself, such as `## Returns`. |
| `custom` | `html` required. `title` optional (admin only). `height` 80 to 2000 (400), initial height only. `data` optional (see "Custom block"). |
| `relatedProducts` | `title` (`"Related Items"`). |
| other fixed blocks | None. Send `{}`. |

`"categoryId": "current"` in a `productList` or a custom `products` query means the category of the page the block is on. On the category page it is the category being shown. On the product page it is the product's category, and a product list leaves out the product itself. On the home page and on custom pages it applies no category filter.

Shapes:

```
{ "type": "carousel", "settings": { "title": "Offers", "images": [{ "url": "https://res.cloudinary.com/.../sale.jpg", "href": "/category/<id>" }], "slides": 1, "sizeMode": "cover", "fullWidth": false, "contain": false, "autoplay": true } }
{ "type": "productList", "settings": { "title": "New arrivals", "categoryId": "<id>", "featuredOnly": false, "search": "under 20000", "limit": 8, "grid": false } }
{ "type": "productList", "settings": { "title": "Top picks", "featuredOnly": true, "limit": 6, "grid": true, "columns": 3, "showName": true, "showPrice": true } }
{ "type": "productList", "settings": { "title": "More like this", "categoryId": "current", "limit": 4 } }
{ "type": "markdown", "settings": { "markdown": "## Returns\n\nYou can return any item within **7 days**.\n\n- Keep the box\n- Keep the bill" } }
{ "type": "custom", "settings": { "title": "Hero", "height": 400, "html": "<div>...</div>", "data": { "deals": { "source": "products", "search": "under 2000", "limit": 8 } } } }
{ "type": "categories", "settings": {} }
{ "type": "categoryBanner", "settings": {} }
{ "type": "relatedProducts", "settings": { "title": "You may also like" } }
```

Images for a Billboard: reuse URLs from `GET {{BASE}}/media` or upload new ones (`{{BASE}}/skill/media`).

### Defaults (no layout saved)

To change one thing on a page with no saved layout, start from its default:

- home: `[ categories ]`
- category: `[ categoryBanner, categoryProducts ]`
- product: `[ productTop, productDescription, relatedProducts ("Related Items") ]`

`GET` returns `null` for a page with no saved layout. PUT the default plus your change, not only your change.

## Custom block

A `custom` block renders arbitrary HTML, Tailwind CSS, and JavaScript inside a sandboxed iframe on any store page (including custom pages). Use it when `carousel`, `productList`, and `markdown` blocks cannot build the layout you need. For the global header and footer, use `{{BASE}}/skill/chrome` instead.

- `html` is a self-contained HTML fragment of up to 300,000 characters. The total request body through the agent link is capped at 400 KB. Do not write `<html>`, `<head>`, or `<body>`. Put scripts in inline `<script>` tags. Remote scripts, stylesheets, fonts, and images load directly.
- The iframe resizes to match your content height. The `height` setting is only the initial height shown before the frame loads.
- The iframe has an opaque origin. Scripts inside it cannot read shopper cookies, authentication, or cart state, and cannot call store APIs. Pass catalog data through the `data` field instead.

### Styling

Style the block with Tailwind CSS classes, your own CSS, or both. The store page behind the iframe is white.

#### Frame defaults

The iframe applies these defaults before your styles:

| Default | Value |
| --- | --- |
| Font | The store font, Inter, on `body`. |
| Text color | `#111827` on `body`. |
| Background | Transparent, so the white store page shows through. |
| `body` margin | `0`. |
| Box sizing | `border-box` on every element. |
| Images | `max-width: 100%`. |
| CSS variables | `--font-store` (the Inter font stack), `--foreground` (`#111827`), `--background` (`#ffffff`), `--muted` (`#6b7280`), and `--border` (`#e5e7eb`). |

Tailwind preflight is not loaded. Headings, paragraphs, and lists keep default browser margins and sizes. Set spacing and sizes with classes such as `m-0` and `text-2xl`, or with your own CSS.

#### Tailwind classes

The server compiles CSS for every Tailwind CSS v4 class found in your `html` string, using the default Tailwind theme. You do not need to load Tailwind.

- Text: `text-xs` to `text-9xl`, `font-thin` to `font-black`, `leading-*`, `tracking-*`, `uppercase`, and `text-center`. `font-sans` uses the store font.
- Color: the full Tailwind palette (such as `text-gray-500`, `bg-amber-100`, `border-red-300`) and opacity modifiers (such as `bg-black/50`).
- Layout and spacing: `flex`, `grid`, `grid-cols-*`, `gap-*`, `p-*`, `m-*`, `w-*`, `max-w-*`, and `aspect-*`.
- Shape and effects: `rounded-*`, `border`, `shadow-*`, `opacity-*`, `transition`, and `object-cover`.
- Arbitrary values: `w-[340px]`, `text-[22px]`, and `bg-[#f5e6c8]`.
- Variants: `hover:`, `focus:`, `group-hover:`, and responsive breakpoints `sm:` (640 px), `md:` (768 px), `lg:` (1024 px), and `xl:` (1280 px).

Rules for Tailwind classes:

- Responsive breakpoints follow the width of the iframe, which matches the page content width.
- The server only compiles class names that appear literally in `html`. Class names inside script strings count (such as `'<b class="text-base">'`). Class names built at runtime do not count (such as `"text-" + size`). Write every full class name somewhere in `html`.
- Store-specific utility classes (such as `dshadow`) do not exist in the iframe. Use Tailwind classes or your own CSS.

#### Your own CSS

Put custom CSS in `<style>` tags or `style="..."` attributes. Standard CSS features work, including `@media`, `@keyframes`, CSS variables, and `:hover`.

- Rules in your `<style>` tags override Tailwind utilities and frame defaults.
- Remote `<link rel="stylesheet">` tags work.

#### Fonts

The store font, Inter, is loaded by default. To use another font, load it in your HTML:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">
<h2 class="m-0 text-4xl" style="font-family:'Playfair Display',serif">Summer sale</h2>
```

Google Fonts work without extra setup. A font file from another server (`@font-face { src: url(...) }`) requires the `Access-Control-Allow-Origin: *` header because the iframe has an opaque origin. Without that header, the browser falls back to Inter. Media uploads accept images only, so you cannot upload font files.

#### Sizes the server refuses

Because the iframe sizes itself to its content, viewport-height units cause an infinite growth loop. The server refuses these values with `400`:

- The units `vh`, `dvh`, `svh`, and `lvh` in CSS or in arbitrary classes such as `h-[50vh]`.
- The classes `h-screen`, `h-dvh`, `h-svh`, and `h-lvh`, including `min-` and `max-` variants such as `min-h-screen`.

Use `px`, `rem`, or `%` instead, such as `h-[600px]` or `min-h-96`.

### Data queries

Declare server data queries in `data` as an object of named queries. The server resolves every query and injects the result as the global `STORE_DATA` object (also on `window.STORE_DATA`). Each query name becomes an array at `STORE_DATA.<name>`.

Query names must start with a letter, contain only letters, digits, and `_`, and have at most 32 characters. `store` is reserved on every page. `category` is reserved on the category page, and `product` is reserved on the product page.

| `source` | Other keys (default) | Item shape |
| --- | --- | --- |
| `products` | `categoryId` (an id or `"current"`), `featuredOnly` (`false`), `search` (same syntax as the store search box, such as `"under 20000"` or `"phone"`), `limit` 1 to 50 (`12`) | `{ id, name, price, priceText, image, images[], url, category: { id, name }, featured, inStock, quantity, description }` |
| `categories` | none | `{ id, name, image, url }` |

`STORE_DATA.store` is `{ name, home }` and is always present without a query. `price` is a number in rupees, or `null` for quote-only items. `priceText` is the formatted price (such as `"₹1,999.00"`) or the store's price-on-request label. Archived products are never returned. Every `url` is a store path ready for `<a href>`.

The current page adds context automatically:

| Page | Extra data | Notes |
| --- | --- | --- |
| `category` | `STORE_DATA.category` (`{ id, name, image, url }`) | The category being shown. |
| `product` | `STORE_DATA.product` (one product item) | The product being shown. |

To show more items from the same category on a product page, query `{ "more": { "source": "products", "categoryId": "current", "limit": 8 } }` and filter out `STORE_DATA.product.id` in your script. A `productList` block with `"categoryId": "current"` does this without custom HTML.

Total resolved data is capped at 200,000 bytes. If your queries exceed that limit, `STORE_DATA.error` explains the overrun. Lower your query limits to fit.

Example for the home page:

```json
{
	"type": "custom",
	"settings": {
		"title": "Deals strip",
		"height": 360,
		"data": { "deals": { "source": "products", "search": "under 2000", "limit": 6 } },
		"html": "<div class='flex gap-3 overflow-x-auto p-4' id='row'></div><script>document.getElementById('row').innerHTML = STORE_DATA.deals.map(function(p){return '<a class=\"min-w-40 text-inherit no-underline\" href=\"'+p.url+'\"><img class=\"aspect-square w-full rounded-xl object-cover\" src=\"'+p.image+'\"><div class=\"mt-2 text-sm\">'+p.name+'</div><b class=\"text-base\">'+p.priceText+'</b></a>'}).join('')</script>"
	}
}
```

### Links

Links starting with `/` (such as `p.url`) navigate inside the store. Links starting with `http://` or `https://` open in a new tab. In scripts, call `STORE.open(p.url)` to navigate inside the store.

## Try it before saving

1. See the data your `data` block returns, live, with no saving:
   `GET {{BASE}}/page-layouts/data?data=<url-encoded JSON of your data block>`
   For a block on the category page, add `&categoryId=<a category id>`. For the product page, add `&productId=<a product id>`. The answer then also has `STORE_DATA.category` or `STORE_DATA.product`, and `"categoryId": "current"` works. The request is a read, so it runs at once in both modes. Errors (bad name, limit too high, data too big, unknown id) come back as 400 or 413 with the reason.
2. If you have a browser or screenshot tool, see the rendered result before saving. Open
   `{{STORE_URL}}/preview/section?vh=800&page=<home|category|product|custom>&section=<url-encoded JSON of the whole block>`
   The block is the object with `type` and `settings`. Give it any `id`. For `page=category`, add `&categoryId=<id>`. For `page=product`, add `&productId=<id>`. Any block works there, fixed ones too. A fixed block that would show nothing shows a grey note instead. Examples are a product without a description and a category without Category billboard images.
3. Without a browser, you cannot see the result. Say so, check the data from step 1, keep the HTML simple, and ask the user to look at the page after saving. You can also render the HTML with a local tool, with the data from step 1 pasted in as `window.STORE_DATA`.
4. `PUT` the layout. After saving, the live pages are `{{STORE_URL}}`, `{{STORE_URL}}/category/{categoryId}`, `{{STORE_URL}}/product/{productId}` and `{{STORE_URL}}/<route>` for a custom page.

## Workflow

1. `GET {{BASE}}/categories` (and `GET {{BASE}}/media` for images) for ids and URLs.
2. `GET {{BASE}}/page-layouts/{page}`. Keep the blocks you do not change. If the answer is `null`, start from the page's default (see "Defaults").
3. `PUT {{BASE}}/page-layouts/{page}` with the full array.

## Caveats

- Every `categoryId` in product lists and custom `products` queries must be a category of this store. Otherwise the server returns 400 `Category not found in this store`. `"current"` is allowed.
- Deleting or replacing blocks, and deleting a custom page, is destructive. Confirm with the user first.
- A PUT of a non-array, or of anything that fails validation, returns `400 { "error": "Invalid layout", "issues": [...] }`. Read `issues[].path` for the bad field.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 404 `No page at /...` | `{page}` must be `home`, `category`, `product` or an existing custom route. Create a custom page with `POST {{BASE}}/page-layouts` first. |
| 400 `/... is used by the store itself. Pick another route.` | The route is reserved. Choose another one. |
| 409 `/... is already a page of this store. Pick another route.` | Choose another route, or PUT blocks to the existing page. |
| 400 `Use lowercase letters, digits and hyphens only. For example: summer-sale` | Fix the route. Use one part, with no `/`, dots or spaces. |
| 400 `A store can have 30 custom pages at most. Delete one first.` | Delete a custom page the owner no longer needs. Confirm with the user first. |
| 400 `The ... page cannot be deleted. Save an empty layout instead.` | Only custom pages can be deleted. |
| 400 `Invalid layout`, `Add at least one image` | Give the Billboard `images` (1 to 20). |
| 400 `Invalid layout`, `Image url must start with http:// or https://` | Use full image links, such as those from `GET {{BASE}}/media`. |
| 400 `Invalid layout`, `Title is required` | Give `productList` and `relatedProducts` a title. |
| 400 `Invalid layout`, discriminator or `invalid_union` error | `type` is not valid for that page. See "Block types and where they work". |
| 400 `... is a fixed block and can be used once on the ... page` | Remove the duplicate. Only the content blocks (`carousel`, `productList`, `markdown`, `custom`) can repeat. |
| 400 `Invalid layout`, `Write some text` | Give the `markdown` block a non-empty `markdown`. |
| 400 `The data name "product" is filled in by the product page itself` | Rename that data query. The same applies to `category` on the category page. |
| 400 `Do not use vh units (or the h-screen and dvh classes)` | Replace `vh`, `dvh`, `svh` and `lvh` units and the `h-screen` and `h-dvh` style classes with px, rem or % values, such as `h-[600px]`. |
| 400 `Category not found in this store` | A `categoryId` is not this store's. |
| A fixed block shows the wrong thing | Its content is not in the layout. Change the category or product it shows (see "Block types and where they work"). |
| Custom block shows a blank or tiny area | Check the browser console of the preview URL. Remove any use of `vh` or of browser APIs that the sandbox blocks. |
