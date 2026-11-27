# Media (image library)

The image library stores uploaded and linked images for the store. Products, categories, page blocks, branding, and chrome store only image URLs. Router: `{{BASE}}/skill/index`.

## Before you write

1. Upload images directly to Cloudinary using the 3-step upload flow below (images only: `jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`; max 6 MB). Never send image files to this server (Vercel rejects bodies over 4.5 MB, and there is no `/media/upload` or `/media/sign` route).
2. Always include `"source": "upload"` or `"source": "url"` on `POST {{BASE}}/media`. Missing or invalid `source` returns `400`.
3. Confirm with the user before deleting any image. Deleting an uploaded image permanently destroys its Cloudinary file.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `POST {{BASE}}/upload-url` | None | `{ uploadUrl, fields: { api_key, timestamp, folder, allowed_formats, public_id, signature }, expiresInMinutes: 60, next }`. Runs at once in both modes. |
| `POST {{BASE}}/media` | Upload registration or URL registration below | `{ id, url, publicId, source, name, createdAt, usedIn: [] }`. Duplicate URLs return the existing row (always with `usedIn: []`). |
| `GET {{BASE}}/media` | `?q=&sort=newest\|oldest\|name&filter=unused&page=0` | `{ items: [{ id, url, publicId, source, name, createdAt, usedIn: [{ type, id, label }] }], hasMore }`. **0-based `page`**, fixed 40 items per page. |
| `DELETE {{BASE}}/media/{id}` | None | `{ ok: true }`, or `409` if still used. Permanently deletes the Cloudinary file for uploads. |

Do not call `POST {{BASE}}/media/sign` (`403`) or `POST {{BASE}}/media/upload` (`404`).

`usedIn[].type` is one of: `product`, `category` (thumbnail), `categoryBanner`, `page` (`id` is `home`, `category`, `product`, or a custom page route with label `Page /<route>`), `logo`, `favicon`, `chrome` (`id` is `navbar` or `footer`), or `description` (URL inside a product Markdown description).

## Fields (`POST {{BASE}}/media`)

| Field | Type | Required | Rules and limits |
| --- | --- | --- | --- |
| `url` | string | Yes | Must start with `https://`, max 2000 chars. For `source: "upload"`, must be the `secure_url` returned by Cloudinary containing `publicId`. |
| `source` | string | Yes | `"upload"` (runs at once in both modes) or `"url"` (returns `202` in permission mode). Always set explicitly. |
| `publicId` | string | Yes for `"upload"` | The exact `public_id` returned by Cloudinary in step 2 (must belong to this store's folder and already exist on Cloudinary). |
| `name` | string | No | Optional display label (truncated to 200 chars; defaults to filename from URL). |

## Upload a local image (3 steps, runs at once in both modes)

One `POST {{BASE}}/upload-url` signature works for one image and stays valid for 1 hour. Call `POST {{BASE}}/upload-url` again for each additional image.

1. Request a signed upload:
   ```
   POST {{BASE}}/upload-url
   ```
2. Upload the file directly to the returned `uploadUrl` as `multipart/form-data`. Send every key from `fields` unchanged and put `file` last:
   ```bash
   curl -X POST "<uploadUrl>" \
   	-F "api_key=<api_key>" -F "timestamp=<timestamp>" -F "folder=<folder>" \
   	-F "allowed_formats=<allowed_formats>" \
   	-F "public_id=<public_id>" -F "signature=<signature>" \
   	-F "file=@photo.jpg"
   ```
   Cloudinary returns `{ "secure_url": "https://res.cloudinary.com/.../photo.jpg", "public_id": "ecom/<store>/<id>", ... }`.
3. Register the upload in the store's library (runs at once in both modes; the server checks the real file size with Cloudinary and deletes files over 6 MB):
   ```json
   {
   	"url": "<secure_url>",
   	"publicId": "<public_id>",
   	"source": "upload",
   	"name": "photo.jpg"
   }
   ```
4. Use the returned `url` in product `images`, category `imageUrl` or `banner`, Billboard `images`, `logo`, `favicon`, Markdown, or HTML.

## Register an existing public `https://` URL (optional)

Other endpoints accept any valid `https://` URL without library registration. To add an external URL to the library, send `POST {{BASE}}/media` (queued as `202` in permission mode):

```json
{
	"url": "https://example.com/photo.jpg",
	"source": "url",
	"name": "Hero photo"
}
```

## Steps: clean up unused images safely

1. Collect all candidate ids **before** deleting anything (deleting shifts later pages): loop `GET {{BASE}}/media?filter=unused&page=0`, `page=1`, `page=2`, and so on until `hasMore` is `false`.
2. Show the list to the user and confirm before deleting.
3. Call `DELETE {{BASE}}/media/{id}` for each confirmed image.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `source must be "upload" or "url"` | Send `"source": "upload"` (after Cloudinary upload) or `"source": "url"`. |
| `400` | `A valid https image link is required` | Use an `https://` URL of 2000 characters or fewer. |
| `400` | `Image is not in this store's folder` | Use the `public_id` Cloudinary returned from your `/upload-url` upload. |
| `400` | `Image link does not match the upload` | Send the exact `secure_url` and `public_id` returned by Cloudinary. |
| `400` | `No uploaded image with this publicId. Upload the file to uploadUrl first.` | Complete step 2 (upload to Cloudinary) before calling `POST /media`. |
| `400` | `Image is bigger than 6 MB and was deleted.` | Compress or resize the file under 6 MB and start again at step 1. |
| `404` | `Not found` (on `DELETE`) | Wrong media id. List `GET {{BASE}}/media?page=0` to get valid ids. |
| `409` | `This image is still used` with `usedIn[]` | Remove or replace the image in every listed item first, then retry `DELETE`. |
| `502` | `Could not check the uploaded image. Try again.` / `Could not delete the file in Cloudinary. Try again.` | Temporary Cloudinary failure. Retry once. |

## Related skills

| When you need to | Read |
| --- | --- |
| Preview page blocks with placeholder URLs before uploading | `{{BASE}}/skill/pages` |
| Set store `logo` or `favicon` | `{{BASE}}/skill/branding` |
| Use images inside `navbarHtml` or `footerHtml` | `{{BASE}}/skill/chrome` |
