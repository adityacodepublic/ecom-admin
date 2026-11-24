# Categories

A category groups products. It has a name, a Thumbnail and a Category billboard. Router: `{{BASE}}/skill/index`.

- `imageUrl` is the Thumbnail. It is the small picture of the category in the home page's category icons (`categories` block).
- `banner` is the Category billboard. It holds the images at the top of the category page (`categoryBanner` block, `{{BASE}}/skill/pages`). It is an array of 0 to 20 `{ url, href }` in order. `href` is where a click on the image goes: a store path such as `/product/<id>`, a full URL, or `""` for nowhere.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/categories` | | `[{ id, name, imageUrl, banner }]` On large stores, add ?page=&pageSize= (`?page=1&pageSize=50` returns `{ items, page, pageSize, hasMore }`). |
| `GET {{BASE}}/categories/{id}` | | `{ id, name, imageUrl, banner }` or `null` |
| `POST {{BASE}}/categories` | `{ name, imageUrl, banner? }` | the new category |
| `PATCH {{BASE}}/categories/{id}` | `{ name, imageUrl, banner? }` | the updated category |
| `DELETE {{BASE}}/categories/{id}` | | the deleted category |

`name` and `imageUrl` are required for both POST and PATCH. `banner` is optional. Leave it out on POST for no Category billboard. Leave it out on PATCH to keep it unchanged. Send `[]` to remove all images.

```
POST {{BASE}}/categories
{ "name": "Phones", "imageUrl": "https://res.cloudinary.com/.../phones-thumb.jpg",
  "banner": [{ "url": "https://res.cloudinary.com/.../phones-sale.jpg", "href": "/search/phone" }] }
```

## Order of operations

1. Upload or pick the image URLs (`{{BASE}}/skill/media`).
2. Create the category.

## Rules and caveats

- Names are not unique. Check `GET /categories` before creating, to avoid duplicates.
- The server stores `imageUrl` as given. It can be any non-empty string. Each `banner` `url` must start with `http://` or `https://`.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Name is required` or `Thumbnail (imageUrl) is required` | Send both fields. |
| 400 `banner...` | Send an array of at most 20 `{ url, href }` with `http(s)` URLs. |
| 500 `Internal error` on DELETE | Products still use the category. Move or delete them first (`{{BASE}}/skill/products`). Also check blocks that filter by this `categoryId` (`{{BASE}}/skill/pages`). |
| 403 | The link no longer owns the store. |
