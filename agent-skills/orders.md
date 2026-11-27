# Orders

Customers place orders on the storefront. You can read orders, update status and payment details, handle returns, add notes, and restore stock. You cannot create or delete orders, and you cannot price a `Quote` order through the agent link (`orders/{id}/quote` is not exposed and returns `404`). Router: `{{BASE}}/skill/index`.

## Before you write

1. Warning: `{id}` in `GET` and `PATCH` accepts either the order UUID **or** the plain order number digits (for example, order `#57` is `GET {{BASE}}/orders/57` or `%2357`). **Never put a literal `#` in the URL path**: `GET {{BASE}}/orders/#57` drops `#57` as a URL fragment and silently returns `200` with the order list.
2. Call `GET {{BASE}}/orders/{id}` before updating an order. Check `statusLock`, `nextStatus`, `prevStatus`, `canCancel`, `canRestoreStock`, and `return` (`return.nextStatus`, `return.prevStatus`, `return.canReject`, `return.canRestock`).
3. Note money units: all money fields in responses (`totalPaise`, `revenuePaise`, `amountPaise`) are **integer paise** (`149900` is 1,499.00 rupees). The list filter parameters `minTotal` and `maxTotal` are **rupees**.

## Endpoints

| Method and path | Query or body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/orders` | Query filters below | `{ orders: [summary], page, pageSize, totalCount, steps, statuses, counts, excludesCancelled }`. Newest first. |
| `GET {{BASE}}/orders/stats` | None | `{ steps, statuses, newStatus, newOrders, inProgress, codToCollect: { count, amountPaise }, revenuePaise, paidOrders, returned, quotes: { toPrice, open }, byStatus, byPaymentStatus, revenueByMonth: [{ month, label, orders, revenuePaise, from, to }] }`. |
| `GET {{BASE}}/orders/{id}` | None | `{ order }` with `items`, `shipTo`, `money`, `events` (private included), `statuses`, `statusKnown`, `statusLock` (`null`, `"FINAL"`, `"RETURN"`, or `"QUOTE"`), `nextStatus`, `prevStatus`, `canCancel`, `canRestoreStock`, `stockRestored`, `returnsEnabled`, `returnStatuses`, `quote`, `canEditQuote`, `charges`, `privateNote`, `customerNote`, `adminContent`, `updatedAt`, and `return` (`status`, `statusKnown`, `nextStatus`, `prevStatus`, `canReject`, `rejected`, `canRestock`). |
| `PATCH {{BASE}}/orders/{id}` | Update body below | `{ changed: boolean, order }`. Runs in one database transaction (all-or-nothing). |

Errors use `{ "error": { "code", "message", "details" } }`. Common codes: `VALIDATION` (`400`), `NOT_FOUND` (`404`), `NO_RETURN` (`404`), `INVALID_TRANSITION` (`409`), `STATUS_LOCKED` (`409`), `INVALID_PAYMENT_TRANSITION` (`409`).

### List query parameters (`GET {{BASE}}/orders`)

All optional:

- `page` (from `1`) and `pageSize` (`1` to `100`, default `20`; bad values return `400`).
- `q`: search by order number (`42` or `#42` URL-encoded as `%2342`), customer name, email, or phone, or receiver name or phone.
- `buyer`: customer user id (`{{BASE}}/skill/users`). When `buyer` is set and `status` is omitted, cancelled orders are excluded and `excludesCancelled` is `true`. To also fetch that customer's cancelled orders, make a second call with `buyer=<id>&status=Cancelled`.
- `status`: exact status label (case-sensitive, such as `Packed`, `Cancelled`, or `Quote`).
- `paymentStatus`: `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, or `FAILED`.
- `from`, `to`: `YYYY-MM-DD` (India time, inclusive).
- `minTotal`, `maxTotal`: **rupees**, inclusive (not paise).
- `returned=1`: only orders with a return.
- `product`: product id.
- `delivery`: `overdue`, `today`, `upcoming`, `nodate`, or `delivered`.
- `state`, `city`, `pincode`, `hour` (`0` to `23`), `weekday` (`0` to `6`).

Summary fields: `id`, `orderNumber`, `createdAt`, `deliveredAt`, `status`, `paymentStatus`, `payment`, `totalPaise`, `itemCount`, `itemNames`, `customer: { id, fname, email, phone }`, `shipTo: { name, phone, city, state, pincode }`, `expectedDelivery`, `returnStatus`.

## Fields (`PATCH {{BASE}}/orders/{id}`)

All fields are optional, but you must send at least one field other than `customerVisible` and `restock` (sending only those returns `400 Nothing to change`). Unknown keys return `400`. Repeating the current value returns `changed: false`.

| Field | Type | Rules and limits | On PATCH if `null` or `""` |
| --- | --- | --- | --- |
| `status` | string | Adjacent `nextStatus` or `prevStatus` from `GET`, or `"Cancelled"` (case-insensitive for cancelled; exact case for list statuses). If `statusKnown` is `false`, any current status in `order.statuses` is allowed. | Cannot be `null` or `""`. |
| `paymentStatus` | string | `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, or `FAILED`. Any value can move to any other. `PAID` does not require a `payment` method. | Cannot be `null` or `""`. |
| `payment` | string | Payment method text (such as `"COD"` or `"UPI to 98xxxx"`), max 50 chars. | `""` clears it. |
| `expectedDelivery` | string or `null` | `"YYYY-MM-DD"`. | `null` clears it. |
| `privateNote` | string or `null` | Admin-only note, max 2000 chars. Never shown to customers. | `null` or `""` clears it. |
| `comment` | string | Timeline comment, 1 to 5000 chars. Private unless `customerVisible: true`. | Cannot be `""`. |
| `customerVisible` | boolean | Applies to `comment` (default `false`). Does not send a notification by itself. | Cannot be sent alone. |
| `adminContent` | string or `null` | Markdown shown on the customer's order page, max 20,000 chars. | `null` or `""` clears it. |
| `restoreStock` | boolean | `true` returns a cancelled order's items to stock once. Works in the **same `PATCH`** as `"status": "Cancelled"` or in a later `PATCH`. Silent no-op if stock was already restored. | Only `true` acts. |
| `returnStatus` | string | Adjacent `return.nextStatus`, `return.prevStatus`, or `"Rejected"` (not from the final return step). | Cannot be `null` or `""`. |
| `restock` | boolean | `true` returns a return's items to stock once (shares the same one-time flag as `restoreStock`). Must be paired with another field such as `returnStatus`. | Cannot be sent alone. |

## Status lock and transition rules

Check `statusLock` from `GET {{BASE}}/orders/{id}` before changing `status`:

| `statusLock` | Meaning | What `status` changes are allowed |
| --- | --- | --- |
| `null` | Normal active order (or already `Cancelled`) | One step forward (`nextStatus`), one step back (`prevStatus`), or `"Cancelled"`. Already `Cancelled` orders cannot move further (`409`). |
| `"FINAL"` | Order is at the last status (such as `Delivered`) | None (`409 STATUS_LOCKED`). Cannot step back or cancel; handle returns with `returnStatus`. |
| `"RETURN"` | Order has an active return | None (`409 STATUS_LOCKED`). Update the return with `returnStatus` instead. |
| `"QUOTE"` | Order is waiting on a price-on-request quote | Only `"Cancelled"` is allowed for `status` (other status values return `409 STATUS_LOCKED`). Non-status fields (`privateNote`, `comment`, `adminContent`, `expectedDelivery`, `payment`, `paymentStatus`) still work. Agents cannot price a quote (`orders/{id}/quote` is `404`); tell the owner to price it in the admin UI. |

Additional transition rules:

- **One step per PATCH**: skipping a status (such as `Confirmed` straight to `Shipped` when `Packed` is in between) fails with `409 INVALID_TRANSITION` and rolls back the whole `PATCH`. Send one `PATCH` per step (`Packed`, then `Shipped`).
- **Admin cancellation**: admin `PATCH` to `"Cancelled"` ignores `cancellation.allowedAt` (that setting restricts customer self-cancellation only). Check `canCancel` on `GET`.
- **One-time stock restoration**: `restoreStock` (cancelled order) and `restock` (return) share one flag. Once stock is restored, `restoreStock: true` is a silent no-op, while `restock: true` returns `400 VALIDATION` (`return.canRestock` is `false`).
- **Restock without changing return status**: send `{ "returnStatus": "<current return.status>", "restock": true }`. Repeating the current `returnStatus` is a no-op and satisfies the "at least one real change" rule.
- **Notifications**: only status changes, cancellation, and return status moves send customer notices. A `customerVisible: true` comment only adds a timeline entry.

## Examples

### Advance one step with an internal note and a customer-visible comment

```json
{
	"status": "Packed",
	"privateNote": "check address",
	"comment": "Packing now",
	"customerVisible": true
}
```

### Cancel an order and restore stock in one PATCH

```json
{
	"status": "Cancelled",
	"restoreStock": true
}
```

### Restock a return without moving its return status

When `order.return.status` is `"Received"` and `order.return.canRestock` is `true`:

```json
{
	"returnStatus": "Received",
	"restock": true
}
```

## Steps

### Move an order forward by two steps (for example `Confirmed` to `Shipped`)

1. Call `GET {{BASE}}/orders/42` (no `#`) and confirm `statusLock` is `null` and `nextStatus` is `"Packed"`.
2. Send `PATCH {{BASE}}/orders/42` with `{ "status": "Packed" }`. In permission mode, wait for approval before step 3.
3. Send `PATCH {{BASE}}/orders/42` with `{ "status": "Shipped" }`.
4. Verify `order.status` in the `PATCH` response.

### List every order for one customer (including cancelled orders)

1. Call `GET {{BASE}}/orders?buyer=<userId>&page=1&pageSize=100` (returns non-cancelled orders; `excludesCancelled: true`).
2. Call `GET {{BASE}}/orders?buyer=<userId>&status=Cancelled&page=1&pageSize=100` for cancelled orders.

## Errors

| Status | Code and message | Fix |
| --- | --- | --- |
| `400` | `VALIDATION`: `Nothing to change` | Sent only `customerVisible` or `restock`. Pair `restock` with `returnStatus` (even the current one). |
| `400` | `VALIDATION`: `Stock can be restored only for a cancelled order` | Include `"status": "Cancelled"` in the same `PATCH`, or cancel first. |
| `400` | `VALIDATION`: `The stock of this order was already put back (or never taken)` | Stock was already restored (`return.canRestock` is `false`). Do not restock again. |
| `404` | `NOT_FOUND`: `Order not found` | Check the order id or number (and ensure no `#` was dropped). |
| `404` | `NO_RETURN`: `This order has no return` | Only send `returnStatus` or `restock` when `order.return` is not `null`. |
| `409` | `INVALID_TRANSITION` | Move one adjacent step at a time using `nextStatus`, `prevStatus`, or `"Cancelled"`. |
| `409` | `STATUS_LOCKED` | Check `statusLock`: `"FINAL"` and `"RETURN"` cannot change `status`; `"QUOTE"` allows only `"Cancelled"`. |

## Related skills

| When you need to | Read |
| --- | --- |
| Edit order statuses, cancellation rules, return rules, or quote labels | `{{BASE}}/skill/order-settings` |
| Look up customer profiles and user ids | `{{BASE}}/skill/users` |
| Edit store phone and WhatsApp shown on order pages | `{{BASE}}/skill/contact` |
