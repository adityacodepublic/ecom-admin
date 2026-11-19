# Pages (home, category and product page layouts)

Three store pages are made of ordered blocks the owner arranges: the **home** page, the **category** page and the **product** page. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/page-layouts/{page}` | The saved array, or `null` when none was saved yet (the page then shows its default, see below). |
| `PUT {{BASE}}/page-layouts/{page}` | The saved array. Replaces the whole layout of that page. |
| `GET {{BASE}}/page-layouts/data?data=...` | Test a custom component's data (see "Try it before saving"). |

`{page}` is `home`, `category` or `product`. There is one layout per page type: the category layout is used by every category page, the product layout by every product page. `PATCH` and `DELETE` do not exist. To change one block, GET the array, edit it, PUT the whole array. `PUT []` saves an empty page (it does not go back to the default, so avoid it).

(`GET/PUT {{BASE}}/home-layout` is the old address of `page-layouts/home` and still works.)

## Blocks per page

Array order is page order, top to bottom. `id` is optional (the server adds one). Settings keys outside the lists below are dropped.

| Page | Block `type` | What it is | Settings (default) |
| --- | --- | --- | --- |
| home | `categories` | Category icons. | none |
| home | `carousel` | A billboard carousel. | `billboardId` required. `title` optional. `slides` 1 to 3 (1). `contain` (false). `autoplay` (true). |
| home | `productList` | A row/list of products. | `title` required, non-empty. `categoryId` optional. `featuredOnly` (false). `search` optional (same words as the store search box, understands "under 20000"). `limit` 1 to 24 (8). |
| home | `productGrid` | A grid of products. | `title` required. `categoryId`, `featuredOnly`, `search` as above. `columns` 2 or 3 (2). `rows` 1 to 6 (2). `showName` (true). `showPrice` (false). |
| category | `categoryBanner` | The category's billboard. | none |
| category | `categoryProducts` | The filters and the grid of the category's products. | none |
| product | `productTop` | Image carousel, name, price, quantity and the buy buttons. | none |
| product | `productDescription` | The product's Markdown description (nothing is shown when the product has none). | none |
| product | `relatedProducts` | Grid of other products from the same category (hidden when there are none). | `title` (`"Related Items"`) |
| any | `custom` | Your own HTML component. | `html` required. `title` optional (admin only). `height` 80 to 2000 (400), only the starting height. `data` optional, see below. |

Rules for the category and product pages: each built-in block can be used **once** (a second one is a 400 error); `custom` can be used any number of times; blocks of other pages are refused. A built-in block you leave out is simply not shown, so do not drop `categoryProducts` or `productTop` unless the owner asked.

Shapes:

```
{ "type": "categories", "settings": {} }
{ "type": "carousel", "settings": { "title": "Offers", "billboardId": "<billboard id>", "slides": 1, "contain": false, "autoplay": true } }
{ "type": "productList", "settings": { "title": "New arrivals", "categoryId": "<id>", "featuredOnly": false, "search": "under 20000", "limit": 8 } }
{ "type": "productGrid", "settings": { "title": "Top picks", "featuredOnly": true, "columns": 2, "rows": 2, "showName": true, "showPrice": false } }
{ "type": "categoryBanner", "settings": {} }
{ "type": "relatedProducts", "settings": { "title": "You may also like" } }
{ "type": "custom", "settings": { "title": "Hero", "height": 400, "html": "<div>...</div>", "data": { "deals": { "source": "products", "search": "under 2000", "limit": 8 } } } }
```

### Defaults (no layout saved)

These reproduce the pages exactly as they were before layouts existed. Starting from them is the safe way to change one thing:

- home: `[ categories ]`
- category: `[ categoryBanner, categoryProducts ]`
- product: `[ productTop, productDescription, relatedProducts ("Related Items") ]`

`GET` returns `null` for a page with no saved layout, so for category and product PUT the default plus your change, not only your change.

## Custom component

A `custom` block is a small web page you write, shown on a store page inside a sandboxed frame. Use it when the built-in blocks cannot make the design you want. It works on all three pages.

- `html`: a self-contained fragment (up to 300,000 characters, and the whole request through the agent link is capped at 400 KB). Put inline `<style>` and `<script>` in it. Do not write `<html>`, `<head>` or `<body>`. Remote scripts, fonts and images load as they are. Do not use `vh`, `dvh`, `svh` or `lvh` units: the frame is sized to the content, so they are refused. Use px, rem or %.
- The frame fits your content height on its own. `height` is only the size shown before the page loads.
- The page is isolated: it cannot read the shopper's cart, login or cookies, and it cannot call any API. It gets its data from `data` and from the page it sits on.
- Page defaults: no margin, system font, CSS variables `--foreground`, `--background`, `--muted`, `--border`. The shop's page background behind it is white.

### Data your component asks for

`data` is an object of named queries. Each name becomes `window.STORE_DATA.<name>`, an array. Names are letters, digits and `_` (start with a letter, up to 32). `store` is reserved (and `category` on the category page, `product` on the product page, see below).

| `source` | Other keys (default) | Items |
| --- | --- | --- |
| `products` | `categoryId`, `featuredOnly` (false), `search` (same words as the store search box, e.g. "under 20000", "phone"), `limit` 1 to 50 (12) | `{ id, name, price, priceText, image, images[], url, category: {id, name}, featured, inStock, quantity, description }` |
| `categories` | none | `{ id, name, image, url }` |
| `billboards` | none | `{ id, label, images: [{ url, href }] }` |

Always available, no query needed: `STORE_DATA.store = { name, home }`. `price` is a number in rupees, `priceText` is formatted ("₹1,999.00"). Archived products are never included. All `url` values are store paths: put them in `<a href>`.

The page the block sits on adds more:

| Page | Extra data | Notes |
| --- | --- | --- |
| category | `STORE_DATA.category` = `{ id, name, image, url }` | The category being shown. |
| product | `STORE_DATA.product` = one product item (same fields as above) | The product being shown. |

In a `products` query, `"categoryId": "current"` means the category of the page the block is on: the category being shown on the category page, the product's category on the product page (on the home page it means no category filter). Example, "more from this category" on the product page: `{ "more": { "source": "products", "categoryId": "current", "limit": 8 } }` and skip `STORE_DATA.product.id` in your script.

The data is capped at 200,000 bytes. If you ask for more, `STORE_DATA.error` explains it. Lower the limits.

Example (home page):

```
{ "type": "custom", "settings": {
  "title": "Deals strip", "height": 360,
  "data": { "deals": { "source": "products", "search": "under 2000", "limit": 6 } },
  "html": "<style>.row{display:flex;gap:12px;overflow-x:auto;padding:16px}.c{min-width:160px;text-decoration:none;color:inherit}.c img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}</style><div class='row' id='row'></div><script>document.getElementById('row').innerHTML = STORE_DATA.deals.map(function(p){return '<a class=\"c\" href=\"'+p.url+'\"><img src=\"'+p.image+'\"><div>'+p.name+'</div><b>'+p.priceText+'</b></a>'}).join('')</script>"
} }
```

### Links

Links to the store (`/...` paths such as `p.url`) open inside the shop. Links that start with `http://` or `https://` open in a new tab. In scripts, `STORE.open(p.url)` does the same as clicking a store link.

### Try it before saving

1. See the data your `data` block returns, live, no saving needed:
   `GET {{BASE}}/page-layouts/data?data=<url-encoded JSON of your data block>`
   For a block on the category page add `&categoryId=<a category id>`, for the product page `&productId=<a product id>`: the answer then also has `STORE_DATA.category` / `STORE_DATA.product`, and `"categoryId": "current"` works. It is a read, so it runs at once in both modes. Errors (bad name, limit too high, data too big, unknown id) come back as 400 or 413 with the reason.
2. See the rendered result before saving, if you have a browser or screenshot tool: open
   `{{STORE_URL}}/preview/section?vh=800&page=<home|category|product>&section=<url-encoded JSON of the whole block>`
   (the block is the object with `type` and `settings`; give it any `id`). For `page=category` add `&categoryId=<id>`, for `page=product` add `&productId=<id>`. Any block works there, built-in ones too.
3. Without a browser you cannot see the result. Say so, check the data in step 1, keep the HTML simple, and ask the user to look at the page after saving. You can also render the HTML yourself with a local tool, using the data from step 1 pasted in as `window.STORE_DATA`.
4. Then `PUT` it. After saving, the live pages are `{{STORE_URL}}`, `{{STORE_URL}}/category/{categoryId}` and `{{STORE_URL}}/product/{productId}`.

## Workflow

1. `GET {{BASE}}/billboards` and `GET {{BASE}}/categories` for ids.
2. `GET {{BASE}}/page-layouts/{page}`. Keep the existing blocks you do not change. If it is `null` on the category or product page, start from the default above.
3. `PUT {{BASE}}/page-layouts/{page}` with the full array.

## Caveats

- Every `billboardId` and `categoryId` must belong to this store, otherwise 400 `Billboard not found in this store` / `Category not found in this store` (`"current"` is fine). A billboard deleted later still leaves the carousel pointing at nothing.
- Deleting or replacing blocks is destructive. Confirm with the user.
- A PUT of a non-array, or of anything that fails validation, returns `400 { "error": "Invalid layout", "issues": [...] }`. Read `issues[].path` for the bad field.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 404 `Unknown page` | `{page}` must be `home`, `category` or `product`. |
| 400 `Invalid layout`, `Choose a billboard` | Add `billboardId` to the carousel. |
| 400 `Invalid layout`, `Title is required` | Give productList, productGrid and relatedProducts a title. |
| 400 `Invalid layout`, discriminator error | `type` is not a block of that page. See the table above. |
| 400 `... can be used once on the category page` (or product page) | Remove the duplicate built-in block. Only `custom` can repeat. |
| 400 `The data name "product" is filled in by the product page itself` | Rename that data query (`category` on the category page). |
| 400 `Do not use vh units` | Replace `vh`, `dvh`, `svh`, `lvh` with px, rem or %. |
| 400 `Category not found in this store` for a custom `data` query | The `categoryId` in a `products` query is not this store's. |
| Custom component shows a blank or tiny area | Check the browser console of the preview URL. Make sure the HTML does not rely on `vh` or on APIs (none are available). |
