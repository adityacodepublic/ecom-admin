# Categories

A category groups products. It stores a `name`, a thumbnail (`imageUrl`), and optional category billboard images (`banner`). Router: `{{BASE}}/skill/index`.

- `imageUrl` is the thumbnail shown in the home page's `categories` block.
- `banner` holds the images shown in the category page's `categoryBanner` block. To change how category billboards display across the store (`aspectRatio`, `fullWidth`, `fill`, `rounded`, `slides`, `autoplay`), edit the `categoryBanner` block in `{{BASE}}/skill/pages`.

## Before you write

1. Call `GET {{BASE}}/categories?page=1&pageSize=100` to check existing names and ids. Category names are not unique, so check before creating to avoid duplicates.
2. Upload or pick image URLs through `{{BASE}}/skill/media`.
3. Before deleting a category, remove all products in it (including archived products) and remove its `categoryId` from any `productList` or `custom` block in `{{BASE}}/skill/pages`.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/categories` | Optional `?page=1&pageSize=50` | Plain array `[{ id, name, imageUrl, banner }]`, or `{ items, page, pageSize, hasMore }` when `page` is set (`pageSize` above 100 clamps to 100). |
| `GET {{BASE}}/categories/{id}` | None | `{ id, name, imageUrl, banner }` or `null`. |
| `POST {{BASE}}/categories` | `{ name, imageUrl, banner? }` | Created category row. |
| `PATCH {{BASE}}/categories/{id}` | `{ name, imageUrl, banner? }` | Updated category row. |
| `DELETE {{BASE}}/categories/{id}` | None | Deleted category row, or `409` if products still use it. |

## Fields

| Field | Type | Required | Rules and limits | On PATCH if omitted, empty, or null |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | Non-empty string. Not unique per store. | Omitting or `""` returns `400`. |
| `imageUrl` | string | Yes | Thumbnail URL from `{{BASE}}/skill/media` (any non-empty string passes validation). | Omitting or `""` returns `400`. |
| `banner` | array | No | 0 to 20 `{ url, href, width?, height? }` objects in display order. `url` must start with `http://` or `https://` (no spaces, max 2000 chars). `href` is a store path such as `/product/<id>` or `/category/<id>`, a full URL, or `""` (max 2000 chars). `width` and `height` are optional positive integers up to 20,000 for natural pixel dimensions. | Omitting keeps stored `banner` unchanged. Sending `[]` removes all banner images. |

## Examples

### Create a category with a category billboard

```json
{
	"name": "Phones",
	"imageUrl": "https://res.cloudinary.com/.../phones-thumb.jpg",
	"banner": [
		{
			"url": "https://res.cloudinary.com/.../phones-sale.jpg",
			"href": "/product/<product id>",
			"width": 1600,
			"height": 667
		}
	]
}
```

### Update only a category's banner images

Always send `name` and `imageUrl` from `GET {{BASE}}/categories/{id}`.

```json
{
	"name": "Phones",
	"imageUrl": "https://res.cloudinary.com/.../phones-thumb.jpg",
	"banner": [
		{ "url": "https://res.cloudinary.com/.../new-banner.jpg", "href": "" }
	]
}
```

### Rename a category without changing its banner

Omit `banner` to keep the existing billboard images.

```json
{
	"name": "Smartphones",
	"imageUrl": "https://res.cloudinary.com/.../phones-thumb.jpg"
}
```

## Steps

### Create a category

1. Call `GET {{BASE}}/categories?page=1&pageSize=100` to avoid creating a duplicate name.
2. Upload or pick thumbnail and banner image URLs (`{{BASE}}/skill/media`).
3. Send `POST {{BASE}}/categories`.
4. Verify with `GET {{BASE}}/categories/{id}`.

### Delete a category

Warning: deleting a category while a page layout still references its `categoryId` causes every later `PUT` on that page to fail with `400 Category not found in this store`, even when editing a different block.

1. Confirm with the user before deleting.
2. Call `GET {{BASE}}/products?categoryId={id}&page=1&pageSize=100` (without `isArchived=false`, because archived products also block deletion). Move or delete every product in the category (`{{BASE}}/skill/products`).
3. Check all page layouts (`GET {{BASE}}/page-layouts`, then `GET {{BASE}}/page-layouts/{page}`) and remove or replace this `categoryId` in any `productList` or `custom` block (`{{BASE}}/skill/pages`).
4. Send `DELETE {{BASE}}/categories/{id}`.
5. Verify with `GET {{BASE}}/categories/{id}` (returns `null`).

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Name is required` / `Thumbnail (imageUrl) is required` | Send both `name` and `imageUrl`. |
| `400` | `banner[N].url: Image url must start with http:// or https://` | Use full `http://` or `https://` URLs with no spaces. |
| `400` | `banner: 20 images at most` | Send 20 or fewer banner items. |
| `404` | `Not found` | Wrong category id or category belongs to another store. |
| `409` | `Make sure you removed all products using this category first.` | Move or delete all products in this category, including archived ones, then retry. |

## Related skills

| When you need to | Read |
| --- | --- |
| Change category billboard display settings (`aspectRatio`, `fullWidth`, `fill`, `rounded`, `slides`, `autoplay`) | `{{BASE}}/skill/pages` |
| Upload or pick thumbnail and banner images | `{{BASE}}/skill/media` |
| Move or delete products before deleting a category | `{{BASE}}/skill/products` |
| Check how `/search/...` banner links work | `{{BASE}}/skill/pages` (Search syntax) |
