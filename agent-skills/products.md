# Products

Router: `{{BASE}}/skill/index`. A product needs a category, at least one image, a price and stock numbers.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/products` | query below | `[{ id, name, price, quantity, maxQuantity, isFeatured, isArchived, images: [{url}] (first only), category: {id, name}, filteritems: [{ value: { value, unit, filter: {name} } }] }]` Large stores: use ?page=&pageSize= on lists (`?page=1&pageSize=50` returns `{ items, page, pageSize, hasMore }`). |
| `GET {{BASE}}/products/{id}` | | `{ id, name, price, quantity, maxQuantity, description, images: [{url, order}], category, filteritems }` or `null` (also `null` for an archived product when the caller is not the owner). No `isFeatured`/`isArchived`. |
| `POST {{BASE}}/products` | body below | the product row (no images) |
| `PATCH {{BASE}}/products/{id}` | body below | the product row |
| `DELETE {{BASE}}/products/{id}` | | the deleted product |

`price` is returned as a string (`"499"`).

List query (all optional): `categoryId`, `searchValue` (name contains, case-insensitive), `isFeatured=true|false`, `isArchived=true|false`, `price` (positive N = price above N, negative -N = price below N), `filterId` (JSON array of arrays of value ids, for example `[["valA","valB"],["valC"]]`: OR inside a group, AND between groups). The list is not paginated. You (the store owner) see archived products too; pass `isArchived=false` to hide them or `isArchived=true` to list only them. The public store never gets archived products: for anyone who is not the signed-in owner the list always excludes them and `GET /products/{id}` returns `null`.

## Body (POST and PATCH)

```
{
  "name": "Pixel 9",                 // required, max 255
  "price": 59999,                    // required, > 0, at most 2 decimals, number or string
  "quantity": 25,                    // required, whole number, 0 or more (0 = out of stock). On PATCH it overwrites live stock, see below
  "maxQuantity": 5,                  // required, whole number, 1 or more (per-order limit)
  "categoryId": "<category id>",     // required, must belong to this store
  "images": [ { "url": "https://...", "order": 1 } ],   // required, at least 1
  "isFeatured": false,               // optional
  "isArchived": false,               // optional
  "description": "Markdown text",    // optional (all markdown syntax supported, images, tables etc.)
  "filteritems": [ { "filterId": "<filter id>", "valueId": "<value id>" } ]   // optional
}
```

Only `valueId` is used from each filteritem. `images[].order` defaults to the position (1, 2, 3) on POST. On PATCH an omitted `order` becomes 1 for every image, so always send it. If you omit `isFeatured`, `isArchived` or `description` on PATCH they stay unchanged. `images` and `filteritems` are always replaced as a whole on PATCH: send the complete list or the product loses them. Everything in a PATCH is applied in one transaction: if any part is invalid nothing changes. Each image needs an `https` `url` (and a whole-number `order` if you send one), `images` must be an array and `filteritems` an array of `{ valueId }`, otherwise 400 and the product is untouched.

**Stock:** customers' orders reduce `quantity` all the time, so a PATCH `quantity` replaces the live stock with your number. Agents: take the current value from the GET and send it back unchanged unless you really mean to change stock (to change stock, send the new `quantity`). The admin form also sends `loadedQuantity` (the stock it loaded) and the server ignores `quantity` when it equals `loadedQuantity`; you can do the same by sending `loadedQuantity` with the value you read from the GET.

## Create a product end to end

1. `GET {{BASE}}/categories`. If you need a new one, follow `{{BASE}}/skill/categories` and read its id.
2. Upload each image: `POST {{BASE}}/upload-url`, upload the file (max 6 MB) to the returned uploadUrl, then `POST {{BASE}}/media` with `source: "upload"` (see `{{BASE}}/skill/media`); it returns `{ "url": "https://res.cloudinary.com/...", "id": "..." }`. Or reuse an existing https URL (`{{BASE}}/skill/media`).
3. For attributes, `GET {{BASE}}/filters` and pick `valueId`s.
4. `POST {{BASE}}/products` with the body above, using the returned urls as `images`.
5. Verify with `GET {{BASE}}/products/{id}`. Get the new `id` from the POST response (in permission mode, from `result.body` of the request).

## Edit a product

`GET {{BASE}}/products/{id}`, change fields, then PATCH with every required field. Re-send `images` (url and order from the GET). The GET does not return value ids, so to keep filteritems, match each returned `{filter.name, value, unit}` to `GET {{BASE}}/filters` and send the `valueId`s. To change stock only, PATCH the full body with a new `quantity`. Otherwise send back the `quantity` you read (and `loadedQuantity` equal to it) so a sale made in between is not overwritten.

## Rules and caveats

- `quantity` may be 0 (stock zero: the store shows it as out of stock and cannot order it). It must be a whole number, 0 or more. `maxQuantity` must be a whole number, 1 or more. Anything else returns 400. Use `isArchived: true` to hide a product entirely.
- `categoryId` must be a category of this store and every `valueId` must belong to a filter of this store. Otherwise 400 `Category not found in this store` / `Filter value not found in this store`, and nothing is changed. Use ids from GET calls.
- Orders keep their own copy of name and price, so editing a product does not change past orders.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Images are required` / `Name is required` / `Category id is required` / `Quantity is required` | Send the missing field. |
| 400 `Price must be a positive amount with at most 2 decimals` | Use `499` or `"499.50"`. No currency symbol or commas. |
| 409 on DELETE (`This product is in an order. Archive it instead of deleting it.`) | The product appears in an order. Archive it instead: PATCH with the full body and `"isArchived": true`. |
| 400 `Quantity must be a whole number, 0 or more` / `Max Quantity must be a whole number, 1 or more` | Send whole numbers (JSON numbers, not text). |
| 400 `Category not found in this store` / `Filter value not found in this store` | Use ids from this store's `GET /categories` and `GET /filters`. |
| 400 `Image N: url must be a web link (http or https)` / `order must be a whole number` / `Images must be an array` | Fix the image list; nothing was changed. |
| Product vanished from filters after editing | `filteritems` was omitted on PATCH. Re-send it. |
