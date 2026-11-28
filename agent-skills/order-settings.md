# Order settings

Order settings define the order status workflow, the checkout payment step, customer cancellation rules, customer return rules, the dashboard waiting threshold, storefront text for price-on-request ("quote") products, and product page buttons. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/order-settings` to read the public settings (`checkoutPaymentStep`, `contact`, `statuses`, `cancellation`, `returns`, `quote`, `productButtons`).
2. Warning: `GET {{BASE}}/order-settings` omits `cancellation.allowedAt`, `waitingUntil`, and `autoEmails`. In full mode, send `PATCH {{BASE}}/order-settings` with `{}` to read the full stored settings unchanged (in permission mode, `PATCH` returns `202`).
3. Warning: renaming or removing statuses in `statuses` silently removes missing names from `cancellation.allowedAt`, which can disable customer cancellation. Always send `cancellation.allowedAt` alongside `statuses` when you change status names.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/order-settings` | None | `{ settings: { checkoutPaymentStep, contact: { phone, whatsapp }, statuses, cancellation: { enabled, askReason, reasons }, returns: { enabled, windowDays, reasons, statuses }, quote: { button, priceText }, productButtons: { withPrice, withoutPrice } } }`. |
| `PATCH {{BASE}}/order-settings` | Any subset below | `{ settings }` with the full settings, including `cancellation.allowedAt`, `waitingUntil`, and `autoEmails`. |

Unknown top-level keys return `400`. Nested objects (`cancellation`, `returns`, `quote`, `productButtons`) merge with stored values, so omitted keys stay unchanged. Errors use `{ "error": { "code", "message", "details" } }`.

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
| `productButtons.<side>.main` | string[] | Ordered buttons for the main row, from `"cart"`, `"buy"`, `"whatsapp"`, and `"call"`. `<side>` is `withPrice` or `withoutPrice`. Replaces the stored list. A button in neither `main` nor `secondary` is off. | `["cart", "buy"]` |
| `productButtons.<side>.secondary` | string[] | Ordered buttons for the secondary box, from the same values as `main`. Replaces the stored list. A button cannot be in both lists. At least one of the two lists must contain a button. | `["whatsapp", "call"]` |
| `productButtons.<side>.heading` | string | Heading above the secondary box, max 40 chars. `""` hides the heading. | `withPrice`: `"Bulk order or questions?"`. `withoutPrice`: `"Prefer to ask directly?"` |
| `productButtons.<side>.text` | object | Custom labels keyed by button, max 24 chars each. Merges per key with stored labels. `""` resets that button to its default. | `cart`: `"Add To Cart"`. `buy`: `"Buy Now"` for `withPrice`, `quote.button` for `withoutPrice`. `whatsapp`: `"WhatsApp"`. `call`: `"Call"` |
| `autoEmails` | boolean | Stored flag only; automatic email sending is not active yet. Omit unless explicitly asked. | `false` |

Product page buttons follow these storefront rules:

- If `"cart"` is off on both sides, the storefront hides `<store-cart />` in the navbar.
- If `"cart"` and `"buy"` are both off on a side, customers cannot place checkout orders for products on that side. On `withoutPrice`, `"buy"` is the quote request button.
- `"whatsapp"` appears only when `whatsapp` is saved, and `"call"` appears only when `phone` is saved (`{{BASE}}/skill/contact`). The server does not check this, so a side can pass validation and still show no buttons.
- On an out-of-stock product, the storefront hides `"cart"` and `"buy"`. If `main` becomes empty, the `secondary` buttons move up into `main`.

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

### Replace quote requests with WhatsApp and Call

Check that `contact.phone` and `contact.whatsapp` are set first. Omitting `"cart"` and `"buy"` turns off quote requests for products without a price.

```json
{
	"productButtons": {
		"withoutPrice": {
			"main": ["whatsapp", "call"],
			"secondary": [],
			"text": {
				"whatsapp": "Ask on WhatsApp"
			}
		}
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
| `400` | `Turn on at least one button`, prefixed with `With a price: ` or `Without a price: ` | Add at least one button to `main` or `secondary` on the named side. |
| `400` | `A button is either main or secondary, not both: ...`, with the same side prefix | Remove each listed button from `main` or from `secondary`. |
| `400` | `A button text is at most 24 characters` | Shorten the value in `productButtons.<side>.text` to 24 characters or fewer. If the text came from the user, follow the over-limit rule in `{{BASE}}/skill/index`. |
| `400` | `The heading is at most 40 characters` | Shorten `productButtons.<side>.heading` to 40 characters or fewer. If the text came from the user, follow the over-limit rule in `{{BASE}}/skill/index`. |
| `400` | `Unrecognized key(s) in object` | Check `details` and send only documented keys. |

## Related skills

| When you need to | Read |
| --- | --- |
| Update individual orders or migrate orders with `statusKnown: false` | `{{BASE}}/skill/orders` |
| Create or edit price-on-request products (`price: null`) | `{{BASE}}/skill/products` |
| Change store phone, WhatsApp, email, or address | `{{BASE}}/skill/contact` |
