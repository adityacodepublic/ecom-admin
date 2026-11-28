# Products

Products are the items customers buy or request a quote for. Each product belongs to one category and has at least one image, a price (or `null` for price on request), and stock counts. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/categories?page=1&pageSize=100` to get a valid `categoryId`.
2. Call `GET {{BASE}}/filters?page=1&pageSize=100` to get `valueId` values for product attributes.
3. Upload new images or pick existing URLs through `{{BASE}}/skill/media`.
4. Before editing a product, read `GET {{BASE}}/products/{id}`. That response omits `isFeatured`, `isArchived`, and filter `valueId` values, so check the edit rules below before sending `PATCH`.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/products` | Query params below | Plain array of products, or `{ items, page, pageSize, hasMore }` when `page` is set. Each item has `{ id, name, price, quantity, maxQuantity, isFeatured, isArchived, images: [{ url }], category: { id, name }, filteritems: [{ value: { value, unit, filter: { name } } }] }`. |
| `GET {{BASE}}/products/{id}` | Optional `?fields=stock` | Full product `{ id, name, price, quantity, maxQuantity, description, images: [{ url, order }], category: { id, name }, filteritems }` or `null`. Omits `isFeatured` and `isArchived`. With `?fields=stock`, returns only `{ quantity, maxQuantity }` or `null`. |
| `POST {{BASE}}/products` | Product body | Created product row (no `images` or `filteritems`). |
| `PATCH {{BASE}}/products/{id}` | Product body (plus optional `loadedQuantity`) | Updated product row. |
| `DELETE {{BASE}}/products/{id}` | None | Deleted product row, or `409` if the product appears in an order. |

`price` is returned as a string (such as `"499.00"`) or `null` (price on request). In `filteritems`, `value.value` is returned as a string (such as `"128"`) or `null`.

### List query parameters

All query parameters on `GET {{BASE}}/products` are optional:

- `page` and `pageSize`: 1-based pagination. Default `pageSize` is 50; values above 100 clamp to 100. Paginated results sort by `id`.
- `categoryId`: exact category id.
- `searchValue`: case-insensitive substring match against the full `name` string.
- `isFeatured`: `true` or `false`.
- `isArchived`: `true` or `false`. As the store owner, you see archived products when this parameter is omitted. The public store never shows archived products.
- `price`: positive number `N` matches `price >= N`; negative `-N` matches `price <= N`. Products with `price: null` are excluded whenever `price` is set.
- `filterId`: URL-encoded JSON array of arrays of `valueId` strings, such as `[["valA","valB"],["valC"]]`. Values inside one inner array use OR; separate inner arrays use AND.
- `forFeed=1`: includes `description` and up to 11 images per item (normally only the first image is returned).

## Fields

| Field | Type | Required | Rules and limits | On PATCH if omitted, empty, or null |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | Max 255 characters. | Omitting or `""` returns `400`. |
| `price` | number, string, or `null` | Yes | Rupees above `0` with at most 2 decimals (`499` or `"499.50"`), or `null` for price on request. No currency symbol or commas. | Omitting or `""` returns `400`. `null` sets price on request. |
| `quantity` | integer or `null` | Yes | Whole JSON number, `0` or more (`0` means out of stock), or `null` to skip stock tracking (always available, never deducted on orders). | Omitting or `""` returns `400`. `null` turns off stock tracking. Ignored when `loadedQuantity` equals `quantity`. |
| `loadedQuantity` | integer or `null` | No (PATCH only) | Whole JSON number, `0` or more, or `null`. Send the `quantity` you read from `GET` when you do not mean to change stock. | Omitting writes `quantity` as given and can overwrite live sales. |
| `maxQuantity` | integer or `null` | No | Whole JSON number, `1` or more (per-order limit), or `null` for no per-order limit. | Omitting, `""`, or `null` clears the per-order limit. |
| `categoryId` | string | Yes | Must belong to this store. | Omitting returns `400`. |
| `images` | array | Yes | At least 1 `{ url, order }`. `url` starts with `http://` or `https://`. `order` is a whole number. | Omitting or `[]` returns `400`. Replaces all images. Always send `order` on PATCH (an omitted `order` becomes `1` for every image). |
| `filteritems` | array | No | Array of `{ "valueId": "<id>" }`. Every `valueId` must belong to this store. | **Always replaces the whole list.** Omitting or `[]` removes every filter from the product. |
| `description` | string | No | GitHub Markdown text. | Omitting keeps the stored description unchanged. |
| `isFeatured` | boolean | No | JSON boolean (`true` or `false`), not a string. | Omitting keeps the stored value unchanged. |
| `isArchived` | boolean | No | JSON boolean (`true` or `false`). `true` hides the product from customers. | Omitting keeps the stored value unchanged. |

Every `PATCH` runs inside one transaction. If any field is invalid, nothing changes.

## Examples

### Create a standard product

```json
{
	"name": "Pixel 9",
	"price": 59999,
	"quantity": 25,
	"maxQuantity": 5,
	"categoryId": "<category id>",
	"images": [
		{ "url": "https://res.cloudinary.com/.../front.jpg", "order": 1 },
		{ "url": "https://res.cloudinary.com/.../back.jpg", "order": 2 }
	],
	"description": "## Overview\n\nCompact flagship phone.",
	"filteritems": [
		{ "valueId": "<value id>" }
	]
}
```

### Create a price-on-request product

```json
{
	"name": "Custom Control Panel",
	"price": null,
	"quantity": 10,
	"maxQuantity": 2,
	"categoryId": "<category id>",
	"images": [
		{ "url": "https://res.cloudinary.com/.../panel.jpg", "order": 1 }
	]
}
```

### Edit description only without touching stock, featured state, images, or filters

Send `loadedQuantity` equal to `quantity` so sales placed while you work are not overwritten.

```json
{
	"name": "Pixel 9",
	"price": "59999",
	"quantity": 25,
	"loadedQuantity": 25,
	"maxQuantity": 5,
	"categoryId": "<category.id from GET>",
	"description": "## Overview\n\nUpdated description text.",
	"images": [
		{ "url": "https://res.cloudinary.com/.../front.jpg", "order": 1 },
		{ "url": "https://res.cloudinary.com/.../back.jpg", "order": 2 }
	],
	"filteritems": [
		{ "valueId": "<matched valueId from GET /filters>" }
	]
}
```

## Steps

### Create a product

1. Call `GET {{BASE}}/categories?page=1&pageSize=100` and pick `categoryId`.
2. Upload each image through `{{BASE}}/skill/media`, or reuse an existing `https://` URL.
3. For attributes, call `GET {{BASE}}/filters?page=1&pageSize=100` and collect `valueId` values.
4. Send `POST {{BASE}}/products`.
5. Verify with `GET {{BASE}}/products/{id}` using the returned `id` (or `result.body.id` in permission mode).

### Edit a product safely

1. Call `GET {{BASE}}/products/{id}`.
2. If the product has `filteritems`, call `GET {{BASE}}/filters?page=1&pageSize=100`. Match each `{ filter.name, value, unit }` to its `id`. Compare numeric `value` by number because `GET` returns numbers as strings (such as `"128"`).
3. Build the `PATCH` body from the `GET` response. Copy every field you are not changing exactly, send all `images` with explicit `order`, and send all matched `filteritems`.
4. Unless you intend to change stock, set `"loadedQuantity"` equal to the `"quantity"` from `GET`.
5. Omit `isFeatured` and `isArchived` unless you intend to change them.
6. Send `PATCH {{BASE}}/products/{id}` and verify with `GET {{BASE}}/products/{id}`.

### Delete or archive a product

1. Confirm with the user before deleting.
2. Send `DELETE {{BASE}}/products/{id}`.
3. If the server returns `409`, the product appears in an order and cannot be deleted. Ask the user, then archive it with `PATCH {{BASE}}/products/{id}` using the safe-edit steps plus `"isArchived": true`.

Past orders keep their own copy of product name and price, so editing a product does not alter past orders.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Name is required` / `Category id is required` / `Images are required` | Send the missing required field. |
| `400` | `Quantity is required (or null to skip stock tracking)` | Send a whole number (`0` or more) or explicit `null`. |
| `400` | `Price is required (or null for Price on request)` | Send a positive rupee amount or explicit `null`. |
| `400` | `Price must be a positive amount with at most 2 decimals` | Send a positive number or string such as `499` or `"499.50"`. Remove symbols and commas. |
| `400` | `Quantity must be a whole number, 0 or more` / `loadedQuantity must be a whole number, 0 or more` | Send whole JSON numbers, `0` or more. |
| `400` | `Max Quantity must be a whole number, 1 or more` | Send a whole JSON number, `1` or more. |
| `400` | `Category not found in this store` / `Filter value not found in this store` | Use ids from this store's `GET /categories` and `GET /filters`. |
| `400` | `Images must be an array` / `Image N: url must be a web link (http or https)` / `Image N: order must be a whole number` | Fix `images`; nothing changed. |
| `400` | `Filter items must be an array` / `Filter item N: valueId is required` | Send `filteritems` as an array of `{ "valueId": "..." }`. |
| `404` | `Not found` | Wrong product id or product belongs to another store. |
| `409` | `This product is in an order. Archive it instead of deleting it.` | Send `PATCH` with the full body and `"isArchived": true`. |

## Related skills

| When you need to | Read |
| --- | --- |
| Create or look up attribute `valueId` values | `{{BASE}}/skill/filters` |
| Create or look up a `categoryId` | `{{BASE}}/skill/categories` |
| Upload or pick product images | `{{BASE}}/skill/media` |
| Change the storefront "Price on request" and quote button text | `{{BASE}}/skill/order-settings` |
| Handle orders created for price-on-request products (`Quote` status) | `{{BASE}}/skill/orders` |
