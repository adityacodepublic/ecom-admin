# Order settings

Router: `{{BASE}}/skill/index`. Settings define the order status list, customer cancellation and customer returns. Orders use them (`{{BASE}}/skill/orders`).

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/order-settings` | `{ settings: { checkoutPaymentStep, contact: {phone, whatsapp}, statuses, cancellation: {enabled, askReason, reasons}, returns: {enabled, windowDays, reasons, statuses} } }`. This is the public subset: it omits `autoEmails` and `cancellation.allowedAt`. |
| `PATCH {{BASE}}/order-settings` | `{ settings }` with the full settings, including `autoEmails` and `cancellation.allowedAt`. |

Errors use `{ "error": { "code", "message", "details" } }` (`VALIDATION` 400).

## PATCH body

Send any subset. Unknown top-level keys return 400. Nested `cancellation` and `returns` merge with what is stored. Omitted fields stay unchanged.

```
{
  "autoEmails": false,
  "checkoutPaymentStep": true,
  "statuses": ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"],
  "cancellation": { "enabled": true, "allowedAt": ["Placed", "Confirmed"], "askReason": true, "reasons": ["Ordered by mistake"] },
  "returns": { "enabled": true, "windowDays": 7, "reasons": ["Damaged"], "statuses": ["Requested", "Approved", "Picked up", "Refunded"] }
}
```

Defaults: statuses `Placed, Confirmed, Packed, Shipped, Out for delivery, Delivered`. Returns are off by default (`windowDays` 10, statuses `Requested, Approved, Picked up, Received, Refunded`). Cancellation is on by default.

## Limits

- `statuses`: 2 to 12 labels, each at most 30 characters. Blanks and case-insensitive duplicates are dropped. `Cancelled` is reserved and rejected. The first status is where new orders start. The last is the final stage (returns open there).
- `returns.statuses`: same limits. `Rejected` is reserved. The first is "requested" and the only one a customer can withdraw from.
- `reasons`: at most 12 kept, each at most 60 characters.
- `returns.windowDays`: integer 1 to 90.
- `cancellation.allowedAt`: entries not in `statuses` are dropped.
- `checkoutPaymentStep`: `true` = checkout places a COD order. `false` = no payment step. Orders then start with an empty payment method that the seller sets with `payment` on the order.

## Caveats

- Always send `statuses` as the complete ordered list. It replaces the old list.
- Renaming or removing a status does not change existing orders. They keep the old text (`statusKnown: false`) and may be moved to any current status. Do the move for each such order after the change (`GET {{BASE}}/orders/stats` shows `byStatus`).
- Removing a status listed in `cancellation.allowedAt` silently removes it from there.
- To change contact numbers use `{{BASE}}/skill/contact`.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Add at least 2 statuses` / `Use at most 12 statuses` | Fix the count. |
| 400 `"Cancelled" is reserved, the system provides it` | Remove it from the list. Cancelling is built in. |
| 400 `... is longer than 30 characters` | Shorten the label. |
| 400 `Unrecognized key(s) in object` or a type message | A key is unknown or has the wrong type. Read `details`. |
