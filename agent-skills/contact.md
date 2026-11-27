# Contact

Contact holds the store's `phone`, `whatsapp`, `email`, and business street `address`. Phone and WhatsApp show on order pages and in the footer (`<store-contact />` and `{{contact.*}}` in `{{BASE}}/skill/chrome`). `address` shows in store SEO structured data and agent Markdown. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/contact` to read the current `phone`, `whatsapp`, `email`, and `address`.
2. Convert any WhatsApp number to digits with country code and no `+` or spaces.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/contact` | None | `{ contact: { phone, whatsapp, email, address } }` |
| `PATCH {{BASE}}/contact` | Any subset `{ phone?, whatsapp?, email?, address? }` | `{ contact: { phone, whatsapp, email, address } }` (full merged contact). |

Unknown keys return `400`. Errors use `{ "error": { "code", "message", "details" } }`.

## Fields

| Field | Type | Required | Rules and limits | On PATCH if omitted or `""` |
| --- | --- | --- | --- | --- |
| `phone` | string | No | Trimmed, max 100 characters. | Omitting leaves `phone` unchanged. `""` clears it. |
| `whatsapp` | string | No | Trimmed, max 100 characters. Send digits with country code and no `+` (such as `"919876543210"`), because the storefront builds `https://wa.me/...` links. The route does not validate the format. For a 10-digit Indian number, the storefront prepends `91` when rendering. | Omitting leaves `whatsapp` unchanged. `""` clears it. |
| `email` | string | No | Trimmed valid email or `""`, max 100 characters. Not exposed as a chrome variable. | Omitting leaves `email` unchanged. `""` clears it. |
| `address` | string | No | Trimmed business street address, max 300 characters. Not exposed as a chrome variable. | Omitting leaves `address` unchanged. `""` clears it. |

## Examples

### Update all four contact fields

```json
{
	"phone": "+91 98765 43210",
	"whatsapp": "919876543210",
	"email": "help@example.com",
	"address": "42 MG Road, Bengaluru, Karnataka 560001"
}
```

### Update only the business street address

```json
{
	"address": "42 MG Road, Bengaluru, Karnataka 560001"
}
```

## Steps

1. Call `GET {{BASE}}/contact` to read the current contact fields.
2. Convert any WhatsApp number to digits with country code and no `+` or spaces.
3. Send `PATCH {{BASE}}/contact` with only the fields to change.
4. Verify with the `PATCH` response.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Invalid email` / `Invalid input` on `email` | Send a valid email address or `""`. |
| `400` | `String must contain at most 100 character(s)` | Shorten `phone`, `whatsapp`, or `email` to 100 characters or fewer. |
| `400` | `String must contain at most 300 character(s)` | Shorten `address` to 300 characters or fewer. |
| `400` | `Unrecognized key(s) in object` | Send only `phone`, `whatsapp`, `email`, and `address`. |

## Related skills

| When you need to | Read |
| --- | --- |
| Read public `phone` and `whatsapp` settings | `{{BASE}}/skill/order-settings` |
| Show phone or WhatsApp in the storefront footer | `{{BASE}}/skill/chrome` |
