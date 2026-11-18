# Billboards

A billboard is a labelled set of banner images. Categories point at one billboard, and the home layout carousel shows one. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/billboards` | | `[{ id, label, images: [{ url, order, href }] }]` Large stores: use ?page=&pageSize= on lists (`?page=1&pageSize=50` returns `{ items, page, pageSize, hasMore }`). |
| `GET {{BASE}}/billboards/{id}` | | `{ label, images: [{ url, href, order }] }` (no `id`; `null` if unknown) |
| `POST {{BASE}}/billboards` | `{ label, images }` | the created billboard `{ id, storeId, label, createdAt, updatedAt }` (no images in the response) |
| `PATCH {{BASE}}/billboards/{id}` | `{ label, images }` | the billboard with `categories` (no images) |
| `DELETE {{BASE}}/billboards/{id}` | | the deleted billboard with `categories` |

`images` is an array of `{ "url": "https://...", "order": 1, "href": "/category/abc" }`. `href` is optional (default empty). `order` is a number. Upload images first (`{{BASE}}/skill/media`).

```
POST {{BASE}}/billboards
{ "label": "Diwali sale", "images": [ { "url": "https://res.cloudinary.com/.../a.jpg", "order": 1, "href": "" } ] }
```

## Rules

- `label` is required and non-empty. `images` must have at least one item. Violations return 400 (`Label is required`, `Images are required`).
- Order is not validated. Number the images 1, 2, 3 yourself.
- PATCH deletes all existing images and recreates them from the body. Send the full list.
- The route does not check that URLs are valid images or are in the library.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Images are required` | Send a non-empty `images` array. |
| 500 `Internal error` on POST/PATCH | An image object is missing `url` or `order` is not a number. Fix the item. |
| 500 `Internal error` on DELETE | The billboard is still used by a category. Repoint or delete those categories first (`{{BASE}}/skill/categories`). Also remove any home-layout carousel that uses it. |
| 405 | The link no longer owns the store. Tell the user. |

Deleting a billboard that a home-layout carousel references leaves a dangling `billboardId`. Update the layout (`{{BASE}}/skill/home-layout`).
