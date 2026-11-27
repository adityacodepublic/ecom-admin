# Order settings

Order settings define the order status workflow, checkout payment step, customer cancellation rules, customer return rules, dashboard waiting threshold, and storefront text for price-on-request ("quote") products. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/order-settings` to read the public settings (`checkoutPaymentStep`, `contact`, `statuses`, `cancellation`, `returns`, `quote`).
2. Warning: `GET {{BASE}}/order-settings` omits `cancellation.allowedAt`, `waitingUntil`, and `autoEmails`. In full mode, send `PATCH {{BASE}}/order-settings` with `{}` to read the full stored settings unchanged (in permission mode, `PATCH` returns `202`).
3. Warning: renaming or removing statuses in `statuses` silently removes missing names from `cancellation.allowedAt`, which can disable customer cancellation. Always send `cancellation.allowedAt` alongside `statuses` when you change status names.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/order-settings` | None | `{ settings: { checkoutPaymentStep, contact: { phone, whatsapp }, statuses, cancellation: { enabled, askReason, reasons }, returns: { enabled, windowDays, reasons, statuses }, quote: { button, priceText } } }`. |
| `PATCH {{BASE}}/order-settings` | Any subset below | `{ settings }` with the full settings, including `cancellation.allowedAt`, `waitingUntil`, and `autoEmails`. |

Unknown top-level keys return `400`. Nested objects (`cancellation`, `returns`, `quote`) merge with stored values; omitted keys stay unchanged. Errors use `{ "error": { "code", "message", "details" } }`.

## Fields (`PATCH {{BASE}}/order-settings`)

| Field | Type | Rules and limits | Default |
| --- | --- | --- | --- |
| `checkoutPaymentStep` | boolean | `true`: checkout places a COD order. `false`: no payment step; orders start with `payment: ""` and the seller sets `payment` on the order. | `true` |
| `statuses` | string[] | Complete ordered list, 2 to 12 labels, max 30 chars each. Blanks and case-insensitive duplicates are dropped. `"Cancelled"` and `"Quote"` are reserved and rejected. First is start; last is final stage (returns open there). | `["Placed", "Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"]` |
| `waitingUntil` | string | Dashboard "Orders waiting too long" threshold status, max 60 chars. If blank or not in `statuses`, falls back to `"Shipped"` (or the first status). | `"Shipped"` (or first status) |
| `cancellation.enabled` | boolean | Turns customer self-cancellation on or off (does not restrict admin cancellation). | `true` |
| `cancellation.allowedAt` | string[] | Statuses where customers may cancel. Entries not in `statuses` are silently dropped. | First 3 statuses (`["Placed", "Confirmed", "Packed"]`) |
| `cancellation.askReason` | boolean | Require a cancellation reason from customers. | `true` |
| `cancellation.reasons` | string[] | Up to 12 reasons kept, max 60 chars each. | 3 default reasons |
| `returns.enabled` | boolean | Turns customer return requests on or off. | `false` |
| `returns.windowDays` | integer | `1` to `90` days counted from when the order reached the final status. | `10` |
| `returns.reasons` | string[] | Up to 12 reasons kept, max 60 chars each. | 4 default reasons |
| `returns.statuses` | string[] | Complete ordered list, 2 to 12 labels, max 30 chars each. `"Rejected"` is reserved and rejected. First is the only stage where a customer may withdraw a return. | `["Requested", "Approved", "Picked up", "Received", "Refunded"]` |
| `quote.button` | string | Storefront CTA button text for price-on-request products, max 24 chars. `""` resets to default. | `"Request a quote"` |
| `quote.priceText` | string | Storefront label shown instead of price when product `price` is `null`, max 24 chars. `""` resets to default. | `"Price on request"` |
| `autoEmails` | boolean | Stored flag only; automatic email sending is not active yet. Omit unless explicitly asked. | `false` |

## Examples

### Update price-on-request (quote) labels only

```json
{
	"quote": {
		"button": "Send enquiry",
		"priceText": "Call for price"
	}
}
```

### Enable 7-day returns

```json
{
	"returns": {
		"enabled": true,
		"windowDays": 7,
		"reasons": ["Damaged", "Wrong item"],
		"statuses": ["Requested", "Approved", "Picked up", "Refunded"]
	}
}
```

### Change order statuses while preserving customer cancellation

```json
{
	"statuses": ["Received", "Packed", "Dispatched", "Delivered"],
	"cancellation": {
		"allowedAt": ["Received", "Packed"]
	}
}
```

## Steps

1. Call `GET {{BASE}}/order-settings` to inspect the current status list and rules.
2. Send `PATCH {{BASE}}/order-settings` with only the fields to change (include `cancellation.allowedAt` whenever you change `statuses`).
3. If you renamed or removed any order status, check `GET {{BASE}}/orders/stats` (`byStatus`). Existing orders keep their old status text (`statusKnown: false`) and can be moved to any current status in `{{BASE}}/skill/orders`.
4. Verify with the `PATCH` response.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Add at least 2 statuses` / `Use at most 12 statuses` | Send 2 to 12 unique non-empty status labels. |
| `400` | `"Cancelled" is reserved, the system provides it` / `"Quote" is reserved, the system provides it` / `"Rejected" is reserved, the system provides it` | Remove the reserved word from the list. |
| `400` | `... is longer than 30 characters` | Shorten the status label to 30 characters or fewer. |
| `400` | `A reason is at most 60 characters` | Shorten each reason to 60 characters or fewer. |
| `400` | `At most 24 characters` | Shorten `quote.button` or `quote.priceText` to 24 characters or fewer. If the text came from the user, follow the over-limit rule in `{{BASE}}/skill/index`. |
| `400` | `Unrecognized key(s) in object` | Check `details` and send only documented keys. |

## Related skills

| When you need to | Read |
| --- | --- |
| Update individual orders or migrate orders with `statusKnown: false` | `{{BASE}}/skill/orders` |
| Create or edit price-on-request products (`price: null`) | `{{BASE}}/skill/products` |
| Change store phone, WhatsApp, email, or address | `{{BASE}}/skill/contact` |
