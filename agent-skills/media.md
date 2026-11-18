# Media (image library)

Every image a store uses can be listed in its image library. Products, billboards and categories store only the image URL. Router: `{{BASE}}/skill/index`.

## Get an image URL (two ways)

1. Upload a file (image only: jpg, jpeg, png, webp, gif, avif; **max 6 MB**). The file goes straight to Cloudinary, not through this server (the server rejects request bodies over 4.5 MB). Two steps, no approval needed in either mode.
   Step 1, get a signed upload:
   ```
   POST {{BASE}}/upload-url
   -> { "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
        "fields": { "api_key", "timestamp", "folder", "allowed_formats", "max_file_size", "public_id", "signature" },
        "expiresInMinutes": 60, "next": "..." }
   ```
   Step 2, send the file to `uploadUrl` as multipart/form-data with EVERY field from `fields` unchanged plus the `file` field (the file part must come last):
   ```
   curl -X POST "<uploadUrl>" \
     -F "api_key=<api_key>" -F "timestamp=<timestamp>" -F "folder=<folder>" \
     -F "allowed_formats=<allowed_formats>" -F "max_file_size=<max_file_size>" \
     -F "public_id=<public_id>" -F "signature=<signature>" \
     -F "file=@photo.jpg"
   -> { "secure_url": "https://res.cloudinary.com/.../photo.jpg", "public_id": "ecom/<store>/<id>", "bytes": 123456, ... }
   ```
   Step 3, add it to the library using the values from Cloudinary's answer (runs at once in both modes):
   ```
   POST {{BASE}}/media
   { "url": "<secure_url>", "publicId": "<public_id>", "source": "upload", "bytes": <bytes>, "name": "optional label" }
   -> { "id": "<media id>", "url": "...", ... }
   ```
   Use `url` in product `images[].url`, billboard `images[].url` or category `imageUrl`. The server checks the real file size with Cloudinary when you register: an image over 6 MB is deleted and refused (400).
   How long the signed data lasts: Cloudinary accepts the signature for about 1 hour from `timestamp`. It is time limited, NOT single use within that hour, but the folder, the one `public_id`, the formats and the size are locked into it, so one `/upload-url` call can only ever produce one image. Call `/upload-url` again for each further image. After an hour, call it again.
2. Use an existing public `https://` image URL, optionally registered so it shows in the library:
   ```
   POST {{BASE}}/media
   { "url": "https://example.com/a.jpg", "source": "url", "name": "optional label" }
   -> { id, url, publicId: null, source: "url", name, createdAt, usedIn: [] }
   ```
   In permission mode this is a write and returns 202. Registering is optional: the other routes accept any URL string without it.

Do not use `POST {{BASE}}/media/sign` (403). Use `/upload-url`.

## List and delete

| Method and path | Notes |
| --- | --- |
| `GET {{BASE}}/media` | Query: `q` (name search, max 100), `sort` (`newest` default, `oldest`, `name`), `filter=unused` (images used nowhere), `page` (from 0, 40 per page). Returns `{ items: [{ id, url, publicId, source, name, createdAt, usedIn: [{type, id, label}] }], hasMore }`. `usedIn.type` is `product`, `billboard`, `category` or `description`. |
| `DELETE {{BASE}}/media/{id}` | Returns `{ ok: true }`. Deletes the library row, and the Cloudinary file for uploads. |

## Rules and caveats

- `source: "url"` entries must start with `https://` and be at most 2000 characters, else 400 `A valid https image link is required`.
- A URL is unique per store. Registering one again returns the existing row.
- `source: "upload"` through `POST /media` needs a real Cloudinary `publicId` from this store's folder that you already uploaded with `/upload-url`. You cannot fake it.
- DELETE of an image still used returns `409 { "error": "This image is still used", "usedIn": [...] }`. Replace the image in those items first, then delete.
- A URL that appears inside a product description Markdown also counts as "used" (`usedIn.type` = `description`).
- Deleting is permanent for uploaded files. Delete only when the user asks. Prefer `filter=unused` for clean-up.
- A failed upload (not an image, too big) is answered by Cloudinary itself in step 2. Compress or convert the file to under 6 MB and call `/upload-url` again.
- `GET {{BASE}}/media` has its own paging (`page` from 0, 40 per page), different from `?page=1&pageSize=` on the other lists.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `A valid https image link is required` | Use an `https://` URL under 2000 characters. |
| 400 `Image is not in this store's folder` | Use the `public_id` Cloudinary returned for your `/upload-url` upload. |
| 400 `No uploaded image with this publicId` | Do step 2 (upload the file to `uploadUrl`) before registering. |
| 400 `Image is bigger than 6 MB` | The asset was deleted. Shrink the image and start again with `/upload-url`. |
| 409 on DELETE | Remove the image from the items in `usedIn` first. |
| 404 on DELETE | Wrong id. List the library to get ids. |
