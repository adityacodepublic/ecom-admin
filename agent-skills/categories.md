# Categories

A category groups products and needs a billboard and an image. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/categories` | | `[{ id, name, imageUrl }]` (no `billboardId`) Large stores: use ?page=&pageSize= on lists (`?page=1&pageSize=50` returns `{ items, page, pageSize, hasMore }`). |
| `GET {{BASE}}/categories/{id}` | | `{ id, name, billboard: { label, images: [{ url, href }] } }` or `null` |
| `POST {{BASE}}/categories` | `{ name, billboardId, imageUrl }` | `{ id, storeId, billboardId, name, imageUrl, createdAt, updatedAt }` |
| `PATCH {{BASE}}/categories/{id}` | `{ name, billboardId, imageUrl }` | the updated category |
| `DELETE {{BASE}}/categories/{id}` | | the deleted category |

All three body fields are required for both POST and PATCH.

```
POST {{BASE}}/categories
{ "name": "Phones", "billboardId": "<id from GET /billboards>", "imageUrl": "https://res.cloudinary.com/.../phones.jpg" }
```

## Order of operations

1. `GET {{BASE}}/billboards` or create one. Take its `id`.
2. Upload or pick an image URL (`{{BASE}}/skill/media`).
3. Create the category.

## Rules and caveats

- Names are not unique. Check `GET /categories` before creating to avoid duplicates.
- `billboardId` must be a billboard of this store, otherwise 400 `Billboard not found in this store` (nothing is changed). Use an id from `GET /billboards`.
- The list does not return `billboardId`. To read it use `GET /categories/{id}` (label and images only, no billboard id). Keep the id from your own create call.
- `imageUrl` is stored as given, any non-empty string.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Name is required` / `Billboard ID is required` / `Image URL is required` | Send all three fields. |
| 500 `Internal error` on DELETE | Products still use the category. Move or delete them first (`{{BASE}}/skill/products`). Also check home-layout sections that filter by this `categoryId`. |
| 405 | The link no longer owns the store. |
