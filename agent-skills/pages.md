# Pages: home, category and product layouts

Each of three store pages is a list of blocks in the order the owner chose: the home page, the category page and the product page. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/page-layouts/{page}` | The saved array, or `null` when none was saved yet. With `null` the page shows its default (see "Defaults"). |
| `PUT {{BASE}}/page-layouts/{page}` | The saved array. Replaces the whole layout of that page. |
| `GET {{BASE}}/page-layouts/data?data=...` | Test a custom component's data (see "Try it before saving"). |

`{page}` is `home`, `category` or `product`. There is one layout per page type. Every category page uses the category layout, and every product page uses the product layout. `PATCH` and `DELETE` do not exist. To change one block, GET the array, edit it, and PUT the whole array. Do not `PUT []`. It saves an empty page and does not restore the default.

## Two kinds of blocks

Content blocks (`carousel`, `productList`, `custom`) keep everything they show in their own `settings`. Every page can use them, any number of times.

Fixed blocks show the store's own data: the categories, the category being shown, or the product being shown. That data is not in the layout, so this endpoint cannot change it. You choose only whether a fixed block appears and where. Each fixed block can appear once per page, and only on its own page. A second copy, or a fixed block on another page, returns a 400 error. A fixed block you leave out is not shown. Keep `categoryProducts` and `productTop` unless the owner asks to remove them.

### Block types and where they work

| Block `type` | Pages | Kind | What it shows | Change its content with |
| --- | --- | --- | --- | --- |
| `carousel` ("Billboard") | all | content | Images in order, each with an optional click target. | Its settings: `images`, `title`, `slides`, `contain`, `autoplay`. |
| `productList` ("Product list") | all | content | Products chosen by category, featured flag and search words, as cards or as a grid of image tiles. | Its settings (see "Block settings"). For the products themselves, see `{{BASE}}/skill/products`. |
| `custom` ("Custom component") | all | content | Your own HTML. | Its settings: `html`, `data`, `height`, `title`. |
| `categories` ("Category icons") | home | fixed | Every category's name and Thumbnail. | Categories: `name`, `imageUrl` (the Thumbnail). `{{BASE}}/skill/categories` |
| `categoryBanner` ("Category billboard") | category | fixed | The images of the category being shown. | That category's `banner`. `{{BASE}}/skill/categories` |
| `categoryProducts` ("Category filters and product grid") | category | fixed | The filters and the products of the category being shown. | Products (`categoryId`, `filteritems`) and filters. `{{BASE}}/skill/products`, `{{BASE}}/skill/filters` |
| `productTop` ("Product details") | product | fixed | Image carousel, name, price, quantity and the buy buttons of the product being shown. | That product's `images`, `name`, `price`, `quantity`, `maxQuantity`. `{{BASE}}/skill/products` |
| `productDescription` ("Product description") | product | fixed | The product's Markdown description. It shows nothing when the product has none. | That product's `description`. `{{BASE}}/skill/products` |
| `relatedProducts` ("Related products") | product | fixed | Up to 8 other in-stock products of the same category. It shows nothing when there are none. | The block sets only `title` (default `"Related Items"`). The product's category decides which products show. |

When no block can show what a design needs, write a `custom` block.

### Block settings

Array order is page order, top to bottom. `id` is optional, and the server adds one. The server drops settings keys that this table does not list.

| Block | Settings (default) |
| --- | --- |
| `carousel` | `images` required: 1 to 20 `{ url, href }` in order. `url` is an `http(s)` image link. `href` is where a click goes: a store path such as `/category/<id>`, a full URL, or `""` for nowhere. `title` optional. `slides` shown at once, 1 to 3 (1). `contain` shows the whole image with no crop (false). `autoplay` (true). |
| `productList` | `title` required, non-empty. `categoryId` optional: a category id or `"current"`. `featuredOnly` (false). `search` optional: the same words as the store search box, and it understands "under 20000". `limit` 1 to 24 (8). `grid` (false): false shows product cards (image, name, price), true shows big image tiles. Only for `grid: true`: `columns` 2 or 3 (2), `showName` (true), `showPrice` (false). |
| `custom` | `html` required. `title` optional (admin only). `height` 80 to 2000 (400), the starting height only. `data` optional, see "Custom component". |
| `relatedProducts` | `title` (`"Related Items"`). |
| other fixed blocks | None. Send `{}`. |

`"categoryId": "current"` in a `productList` or a custom `products` query means the category of the page the block is on. On the category page it is the category being shown. On the product page it is the product's category, and a product list leaves out the product itself. On the home page it applies no category filter.

Shapes:

```
{ "type": "carousel", "settings": { "title": "Offers", "images": [{ "url": "https://res.cloudinary.com/.../sale.jpg", "href": "/category/<id>" }], "slides": 1, "contain": false, "autoplay": true } }
{ "type": "productList", "settings": { "title": "New arrivals", "categoryId": "<id>", "featuredOnly": false, "search": "under 20000", "limit": 8, "grid": false } }
{ "type": "productList", "settings": { "title": "Top picks", "featuredOnly": true, "limit": 6, "grid": true, "columns": 3, "showName": true, "showPrice": true } }
{ "type": "productList", "settings": { "title": "More like this", "categoryId": "current", "limit": 4 } }
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

## Custom component

A `custom` block is a small web page you write. It shows on a store page inside a sandboxed frame. Use it when the other blocks cannot make the design you want. It works on all three pages.

- `html`: a self-contained fragment, up to 300,000 characters. The whole request through the agent link is capped at 400 KB. Put inline `<style>` and `<script>` in it. Do not write `<html>`, `<head>` or `<body>`. Remote scripts, stylesheets, fonts and images load as they are. Do not use `vh`, `dvh`, `svh` or `lvh` units. The frame is sized to the content, so the server refuses them. Use px, rem or %.
- The frame fits your content height on its own. `height` is only the size shown before the page loads.
- The frame is isolated. It cannot read the shopper's cart, login or cookies, and it cannot call any API. It gets its data from `data` and from the page it sits on.
- Frame defaults: no margin, the store's font (Inter, as `font-family: var(--font-store)` on `body`), and the CSS variables `--foreground`, `--background`, `--muted`, `--border` and `--font-store`. The store's page background behind the frame is white.
- To use another font, load it in your HTML, for example
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap"><style>.title{font-family:"Playfair Display",serif}</style>`.
  Google Fonts works as is. Serve a font file from elsewhere (`@font-face { src: url(...) }`) with `Access-Control-Allow-Origin: *`, because the frame has its own origin. Without that header, the browser falls back to the store font. Media uploads are images only, so you cannot upload a font file here.

### Data your component asks for

`data` is an object of named queries. Each name becomes `window.STORE_DATA.<name>`, an array. A name has letters, digits and `_`, starts with a letter, and has up to 32 characters. `store` is reserved everywhere. `category` is reserved on the category page and `product` on the product page, because the page fills those in.

| `source` | Other keys (default) | Items |
| --- | --- | --- |
| `products` | `categoryId` (an id or `"current"`), `featuredOnly` (false), `search` (same words as the store search box, such as "under 20000" or "phone"), `limit` 1 to 50 (12) | `{ id, name, price, priceText, image, images[], url, category: {id, name}, featured, inStock, quantity, description }` |
| `categories` | none | `{ id, name, image, url }` |

`STORE_DATA.store = { name, home }` is always available. It needs no query. `price` is a number in rupees, and `priceText` is formatted ("₹1,999.00"). Archived products are never included. All `url` values are store paths. Put them in `<a href>`.

The page the block sits on adds more:

| Page | Extra data | Notes |
| --- | --- | --- |
| category | `STORE_DATA.category` = `{ id, name, image, url }` | The category being shown. |
| product | `STORE_DATA.product` = one product item (same fields as a `products` item) | The product being shown. |

Example, "more from this category" on the product page: `{ "more": { "source": "products", "categoryId": "current", "limit": 8 } }`, and skip `STORE_DATA.product.id` in your script. A `productList` block with `"categoryId": "current"` does the same with no HTML.

The data is capped at 200,000 bytes. If you ask for more, `STORE_DATA.error` explains it. Lower the limits.

Example for the home page:

```
{ "type": "custom", "settings": {
  "title": "Deals strip", "height": 360,
  "data": { "deals": { "source": "products", "search": "under 2000", "limit": 6 } },
  "html": "<style>.row{display:flex;gap:12px;overflow-x:auto;padding:16px}.c{min-width:160px;text-decoration:none;color:inherit}.c img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}</style><div class='row' id='row'></div><script>document.getElementById('row').innerHTML = STORE_DATA.deals.map(function(p){return '<a class=\"c\" href=\"'+p.url+'\"><img src=\"'+p.image+'\"><div>'+p.name+'</div><b>'+p.priceText+'</b></a>'}).join('')</script>"
} }
```

### Links

Links to the store (`/...` paths such as `p.url`) open inside the shop. Links that start with `http://` or `https://` open in a new tab. In scripts, `STORE.open(p.url)` does the same as clicking a store link.

## Try it before saving

1. See the data your `data` block returns, live, with no saving:
   `GET {{BASE}}/page-layouts/data?data=<url-encoded JSON of your data block>`
   For a block on the category page, add `&categoryId=<a category id>`. For the product page, add `&productId=<a product id>`. The answer then also has `STORE_DATA.category` or `STORE_DATA.product`, and `"categoryId": "current"` works. The request is a read, so it runs at once in both modes. Errors (bad name, limit too high, data too big, unknown id) come back as 400 or 413 with the reason.
2. If you have a browser or screenshot tool, see the rendered result before saving. Open
   `{{STORE_URL}}/preview/section?vh=800&page=<home|category|product>&section=<url-encoded JSON of the whole block>`
   The block is the object with `type` and `settings`. Give it any `id`. For `page=category`, add `&categoryId=<id>`. For `page=product`, add `&productId=<id>`. Any block works there, fixed ones too. A fixed block that would show nothing shows a grey note instead. Examples are a product without a description and a category without Category billboard images.
3. Without a browser, you cannot see the result. Say so, check the data from step 1, keep the HTML simple, and ask the user to look at the page after saving. You can also render the HTML with a local tool, with the data from step 1 pasted in as `window.STORE_DATA`.
4. `PUT` the layout. After saving, the live pages are `{{STORE_URL}}`, `{{STORE_URL}}/category/{categoryId}` and `{{STORE_URL}}/product/{productId}`.

## Workflow

1. `GET {{BASE}}/categories` (and `GET {{BASE}}/media` for images) for ids and URLs.
2. `GET {{BASE}}/page-layouts/{page}`. Keep the blocks you do not change. If the answer is `null`, start from the page's default (see "Defaults").
3. `PUT {{BASE}}/page-layouts/{page}` with the full array.

## Caveats

- Every `categoryId` in product lists and custom `products` queries must be a category of this store. Otherwise the server returns 400 `Category not found in this store`. `"current"` is allowed.
- Deleting or replacing blocks is destructive. Confirm with the user first.
- A PUT of a non-array, or of anything that fails validation, returns `400 { "error": "Invalid layout", "issues": [...] }`. Read `issues[].path` for the bad field.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 404 `Unknown page` | `{page}` must be `home`, `category` or `product`. |
| 400 `Invalid layout`, `Add at least one image` | Give the Billboard `images` (1 to 20). |
| 400 `Invalid layout`, `Image url must start with http:// or https://` | Use full image links, such as those from `GET {{BASE}}/media`. |
| 400 `Invalid layout`, `Title is required` | Give `productList` and `relatedProducts` a title. |
| 400 `Invalid layout`, discriminator / `invalid_union` error | `type` is not a block of that page. See "Block types and where they work". |
| 400 `... is a fixed block and can be used once on the ... page` | Remove the duplicate. Only the content blocks (`carousel`, `productList`, `custom`) can repeat. |
| 400 `The data name "product" is filled in by the product page itself` | Rename that data query. The same applies to `category` on the category page. |
| 400 `Do not use vh units` | Replace `vh`, `dvh`, `svh` and `lvh` with px, rem or %. |
| 400 `Category not found in this store` | A `categoryId` is not this store's. |
| A fixed block shows the wrong thing | Its content is not in the layout. Change the category or product it shows (see "Block types and where they work"). |
| Custom component shows a blank or tiny area | Check the browser console of the preview URL. Remove any use of `vh` or of APIs, which are not available. |
