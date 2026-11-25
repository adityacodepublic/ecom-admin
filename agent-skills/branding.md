# Store name and logo

The name and logo show in the store's header, its footer (© year name), and the browser tab. To edit the navbar or footer HTML itself, read `{{BASE}}/skill/chrome`. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/branding` | | `{ branding: { name, logo, logoOnly } }` |
| `PATCH {{BASE}}/branding` | `{ name?, logo?, logoOnly? }` | `{ branding: { name, logo, logoOnly } }` |

Send any subset. Omitted fields stay unchanged. Unknown keys return 400.

| Field | Rule |
| --- | --- |
| `name` | 2 to 60 characters. |
| `logo` | An image link (`http://` or `https://`), or `""` for the default icon. Upload or pick one with `{{BASE}}/skill/media`. Next to the name the logo shows small (about 18 px), so use a square icon. |
| `logoOnly` | `true`: the header shows only the logo, about 28 px high and up to 180 px wide, without the name. Use it when the logo already contains the store name, as a wordmark does. The name still shows in the footer and the browser tab. It has no effect while `logo` is `""`. |

```
PATCH {{BASE}}/branding
{ "logo": "https://res.cloudinary.com/.../logo.png" }
```

The store shows the change within a few seconds.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Use at least 2 characters` | Send a longer name. |
| 400 `The logo must be an image link (http or https)` | Send a full image URL or `""`. |
| 400 `Unrecognized key(s) in object` | Only `name`, `logo` and `logoOnly`. |
