# Home layout

The store's home page is an ordered list of sections. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/home-layout` | The saved array, or `null` when none was saved yet. |
| `PUT {{BASE}}/home-layout` | The saved array. Replaces the whole layout. |

`PATCH` and `DELETE` do not exist. To change one section, GET the array, edit it, PUT the whole array. To clear, PUT `[]`.

## Section shapes

Array order is page order. `id` is optional (the server adds one). Settings keys outside the lists below are dropped.

```
{ "type": "categories", "settings": {} }
{ "type": "carousel", "settings": { "title": "Offers", "billboardId": "<billboard id>", "slides": 1, "contain": false, "autoplay": true } }
{ "type": "productList", "settings": { "title": "New arrivals", "categoryId": "<id>", "featuredOnly": false, "search": "under 20000", "limit": 8 } }
{ "type": "productGrid", "settings": { "title": "Top picks", "featuredOnly": true, "columns": 2, "rows": 2, "showName": true, "showPrice": false } }
{ "type": "custom", "settings": { "title": "Hero", "height": 400, "html": "<div>...</div>", "data": { "deals": { "source": "products", "search": "under 2000", "limit": 8 } } } }
```

| Type | Settings (default) |
| --- | --- |
| `categories` | none. Shows category icons. |
| `carousel` | `billboardId` required. `title` optional. `slides` 1 to 3 (1). `contain` (false). `autoplay` (true). |
| `productList` | `title` required, non-empty. `categoryId` optional. `featuredOnly` (false). `search` optional, works like the store search box and understands phrases like "under 20000". `limit` 1 to 24 (8). |
| `custom` | Your own HTML component. `html` required. `title` optional (admin only). `height` 80 to 2000 (400), only the starting height. `data` optional, see "Custom component" below. |
| `productGrid` | `title` required. `categoryId`, `featuredOnly`, `search` as above. `columns` 2 or 3 (2). `rows` 1 to 6 (2). `showName` (true). `showPrice` (false). |

## Custom component

A `custom` section is a small web page you write, shown on the store home page inside a sandboxed frame. Use it when the four built-in sections cannot make the design you want.

- `html`: a self-contained fragment (up to 300,000 characters, and the whole request through the agent link is capped at 400 KB). Put inline `<style>` and `<script>` in it. Do not write `<html>`, `<head>` or `<body>`. Remote scripts, fonts and images load as they are. Do not use `vh`, `dvh`, `svh` or `lvh` units: the frame is sized to the content, so they are refused. Use px, rem or %.
- The frame fits your content height on its own. `height` is only the size shown before the page loads.
- The page is isolated: it cannot read the shopper's cart, login or cookies, and it cannot call any API. It gets its data from `data`.
- Page defaults: no margin, system font, CSS variables `--foreground`, `--background`, `--muted`, `--border`. The shop's page background behind it is white.

### Data your component asks for

`data` is an object of named queries. Each name becomes `window.STORE_DATA.<name>`, an array. Names are letters, digits and `_` (start with a letter, up to 32). `store` is reserved.

| `source` | Other keys (default) | Items |
| --- | --- | --- |
| `products` | `categoryId`, `featuredOnly` (false), `search` (same words as the store search box, e.g. "under 20000", "phone"), `limit` 1 to 50 (12) | `{ id, name, price, priceText, image, images[], url, category: {id, name}, featured, inStock, quantity, description }` |
| `categories` | none | `{ id, name, image, url }` |
| `billboards` | none | `{ id, label, images: [{ url, href }] }` |

Always available, no query needed: `STORE_DATA.store = { name, home }`. `price` is a number in rupees, `priceText` is formatted ("₹1,999.00"). Archived products are never included. All `url` values are store paths: put them in `<a href>`.

The data is capped at 200,000 bytes. If you ask for more, `STORE_DATA.error` explains it. Lower the limits.

Example:

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
   `GET {{BASE}}/home-layout/data?data=<url-encoded JSON of your data block>`
   It is a read, so it runs at once in both modes. Errors (bad name, limit too high, data too big) come back as 400 or 413 with the reason.
2. See the rendered result before saving, if you have a browser or screenshot tool: open
   `{{STORE_URL}}/preview/section?vh=800&section=<url-encoded JSON of the whole section>`
   (the section is the object with `type` and `settings`; give it any `id`).
3. Without a browser you cannot see the result. Say so, check the data in step 1, keep the HTML simple, and ask the user to look at the home page after saving. You can also render the HTML yourself with a local tool, using the data from step 1 pasted in as `window.STORE_DATA`.
4. Then `PUT` it. After saving, the live page is `{{STORE_URL}}`.

## Workflow

1. `GET {{BASE}}/billboards` and `GET {{BASE}}/categories` for ids.
2. `GET {{BASE}}/home-layout` and keep the existing sections you do not change.
3. `PUT {{BASE}}/home-layout` with the full array.

## Caveats

- Every `billboardId` and `categoryId` must belong to this store, otherwise 400 `Billboard not found in this store` / `Category not found in this store`. A billboard deleted later still leaves the carousel pointing at nothing.
- Deleting or replacing sections is destructive. Confirm with the user.
- A PUT of a non-array, or of anything that fails validation, returns `400 { "error": "Invalid layout", "issues": [...] }`. Read `issues[].path` for the bad field.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Invalid layout`, `Choose a billboard` | Add `billboardId` to the carousel. |
| 400 `Invalid layout`, `Title is required` | Give productList and productGrid a title. |
| 400 `Invalid layout`, discriminator error | `type` must be `categories`, `carousel`, `productList`, `productGrid` or `custom`. |
| 400 `Do not use vh units` | Replace `vh`, `dvh`, `svh`, `lvh` with px, rem or %. |
| 400 `Category not found in this store` for a custom `data` query | The `categoryId` in a `products` query is not this store's. |
| Custom component shows a blank or tiny area | Check the browser console of the preview URL. Make sure the HTML does not rely on `vh` or on APIs (none are available). |
