# Branding (name, logo, favicon)

Branding controls the store's `name`, `logo`, `logoOnly` header mode, and browser-tab `favicon`. The name and logo show in the header (`<store-logo />`), footer (`© year name`), and browser tab. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/branding` to read the current values.
2. Upload new logo or favicon images through `{{BASE}}/skill/media`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/branding` | None | `{ branding: { name, logo, logoOnly, favicon } }` |
| `PATCH {{BASE}}/branding` | Any subset `{ name?, logo?, logoOnly?, favicon? }` | `{ branding: { name, logo, logoOnly, favicon } }` |

Unknown keys return `400`. Errors use `{ "error": { "code", "message", "details" } }`.

## Fields

| Field | Type | Required | Rules and limits | On PATCH if omitted or `""` |
| --- | --- | --- | --- | --- |
| `name` | string | No | Trimmed, 2 to 60 characters. | Omitting leaves `name` unchanged. `""` returns `400`. |
| `logo` | string | No | `http://` or `https://` URL (no spaces, max 2000 chars), or `""`. Next to the name, the logo renders at about 18 px, so use a square icon unless `logoOnly` is `true`. | Omitting leaves `logo` unchanged. `""` restores the default icon. |
| `logoOnly` | boolean | No | `true` shows only the logo in the header (about 28 px tall, up to 180 px wide) without the name text. Use this for a wordmark logo. The name still appears in the footer and browser tab. Has no effect while `logo` is `""`. | Omitting leaves `logoOnly` unchanged. |
| `favicon` | string | No | `http://` or `https://` URL (no spaces, max 2000 chars) ending in `.ico`, `.png`, `.svg`, `.webp`, `.jpg`, `.jpeg`, or `.gif`, or any `cloudinary.com` link; or `""`. A square image at least 48 px works best. | Omitting leaves `favicon` unchanged. `""` uses `logo` as the browser-tab icon. |

## Examples

### Set a wordmark logo and a separate browser-tab favicon

```json
{
	"logo": "https://res.cloudinary.com/.../wordmark.png",
	"logoOnly": true,
	"favicon": "https://res.cloudinary.com/.../favicon.png"
}
```

### Reset the favicon so the browser tab uses the logo

```json
{
	"favicon": ""
}
```

## Steps

1. Call `GET {{BASE}}/branding` to see what is currently set.
2. Upload any new logo or favicon through `{{BASE}}/skill/media`.
3. Send `PATCH {{BASE}}/branding` with only the fields you want to change.
4. Verify with the `PATCH` response and on the live storefront `{{STORE_URL}}` (changes appear within a few seconds).

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Use at least 2 characters` / `String must contain at most 60 character(s)` | Send a `name` between 2 and 60 characters. |
| `400` | `The logo must be an image link (http or https)` | Send a full `http://` or `https://` URL with no spaces, or `""`. |
| `400` | `The favicon must be an image link (http or https)` | Send a full `http://` or `https://` URL with no spaces, or `""`. |
| `400` | `The favicon must be an .ico, .png, .svg, .webp, .jpg, .gif or Cloudinary image` | Send a URL ending in `.ico`, `.png`, `.svg`, `.webp`, `.jpg`, `.jpeg`, or `.gif`, or a Cloudinary link, or `""`. |
| `400` | `Unrecognized key(s) in object` | Send only `name`, `logo`, `logoOnly`, and `favicon`. |

## Related skills

| When you need to | Read |
| --- | --- |
| Upload or pick a logo or favicon image | `{{BASE}}/skill/media` |
| Edit navbar or footer HTML around `<store-logo />` | `{{BASE}}/skill/chrome` |
