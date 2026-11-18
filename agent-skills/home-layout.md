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
```

| Type | Settings (default) |
| --- | --- |
| `categories` | none. Shows category icons. |
| `carousel` | `billboardId` required. `title` optional. `slides` 1 to 3 (1). `contain` (false). `autoplay` (true). |
| `productList` | `title` required, non-empty. `categoryId` optional. `featuredOnly` (false). `search` optional, works like the store search box and understands phrases like "under 20000". `limit` 1 to 24 (8). |
| `productGrid` | `title` required. `categoryId`, `featuredOnly`, `search` as above. `columns` 2 or 3 (2). `rows` 1 to 6 (2). `showName` (true). `showPrice` (false). |

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
| 400 `Invalid layout`, discriminator error | `type` must be `categories`, `carousel`, `productList` or `productGrid`. |
