# Orders

Router: `{{BASE}}/skill/index`. Customers place orders in the store app. You can read orders and update them. You cannot create or delete orders. Status rules come from the store's settings (`{{BASE}}/skill/order-settings`).

Errors here are `{ "error": { "code", "message", "details" } }`. Common codes: `VALIDATION` 400, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `STATUS_LOCKED` 409, `INVALID_PAYMENT_TRANSITION` 409, `NO_RETURN` 404.

## Endpoints

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/orders` | `{ orders: [summary], page, pageSize, totalCount, steps, statuses, counts }` |
| `GET {{BASE}}/orders/stats` | `{ steps, statuses, newStatus, newOrders, inProgress, codToCollect: {count, amountPaise}, revenuePaise, paidOrders, byStatus, byPaymentStatus, revenueByMonth: [{month, revenuePaise}] }` |
| `GET {{BASE}}/orders/{id}` | `{ order }` with items, shipTo, money, events (private ones included), statuses, `statusLock` (`null`, `"FINAL"` or `"RETURN"`), `nextStatus`, `prevStatus`, `canCancel`, `canRestoreStock`, `return` (with `canRestock`) |
| `PATCH {{BASE}}/orders/{id}` | `{ changed: boolean, order }` |

`{id}` is the order uuid or the order number (`42` or `#42`; digits up to 9 are read as a number). All money in orders is integer paise (`totalPaise: 49900` = 499.00 rupees).

List query: `q` (search: order number `#42` or `42`, customer name/email/phone, receiver name/phone), `status` (exact status text, case-sensitive), `paymentStatus` (`PENDING|PAID|PARTIALLY_REFUNDED|REFUNDED|FAILED`), `from` and `to` (`YYYY-MM-DD`, India time, inclusive), `page` (from 1), `pageSize` (1 to 100, default 20). Newest first. Summary fields: `id, orderNumber, createdAt, status, paymentStatus, payment, totalPaise, itemCount, itemNames, customer {id, fname, email, phone}, shipTo {name, phone, pincode}, expectedDelivery, returnStatus`.

## Update body (PATCH)

All keys optional, but at least one must be set. Unknown keys return 400.

| Key | Meaning |
| --- | --- |
| `status` | Next or previous status in the store's list, or `"Cancelled"`. See rules. |
| `paymentStatus` | `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`. Any value to any other. |
| `payment` | Payment method text, max 50 (`"COD"`, `"UPI to 98xxxx"`). `""` clears it. |
| `expectedDelivery` | `"YYYY-MM-DD"` or `null` to clear. |
| `privateNote` | Admin-only note, max 2000. `null` clears. |
| `comment` | Timeline comment, 1 to 5000 chars. Private unless `"customerVisible": true`. |
| `adminContent` | Markdown shown on the customer's order page, max 20000. `null` clears. |
| `restoreStock` | `true`: put a cancelled order's items back into stock (once; shares one flag with `restock`). |
| `returnStatus` | Move the order's return. See rules. |
| `restock` | With a return: put the items back into stock (once per order; shares one flag with `restoreStock`). |

```
PATCH {{BASE}}/orders/42
{ "status": "Shipped", "expectedDelivery": "2026-12-01", "comment": "Courier booked", "customerVisible": true }
```

## Rules

- Status moves one step forward or one step back in `order.statuses`, or to `"Cancelled"`. Skipping a step returns 409 `INVALID_TRANSITION`. Read `nextStatus` and `prevStatus` from `GET /orders/{id}` and use them.
- `status` text is case-sensitive and must equal a list entry. An order whose status is no longer in the list (`statusKnown: false`) may move to any current status.
- Frozen orders: from the last (final) status the order cannot be moved at all (no step back, no cancel; that stage is for returns), and while the order has a return (any return state) its status cannot be moved either. Both give 409 `STATUS_LOCKED` ("This order is complete and can't be moved." or "A return is in progress."). Check `statusLock` first: when it is not `null`, `nextStatus` and `prevStatus` are `null` and `canCancel` is false. An order with an old unlisted status may still move to a listed status when it is not at the final status and has no return. `Cancelled` is final and cannot be changed.
- Cancelling does not restore stock. Send `"restoreStock": true` in the same or a later PATCH. It works only when `canRestoreStock` is true and only once.
- Stock is added back at most once per order: `restoreStock` (cancelled order) and `restock` (return) use the same flag. After one of them ran, the other has nothing to add (`restock` then returns 400 `VALIDATION`; `return.canRestock` is false).
- Returns: customers request them. `returnStatus` moves one step through `returns.statuses` or to `"Rejected"` (not from the last step). `restock: true` returns the items to stock once (see above). The customer can withdraw a return only while it is at the first return status, only if it was not restocked, and only once per order. An order with no return gives 404 `NO_RETURN`.
- Payment method text is free. Status `PAID` does not need a method.
- Customer-visible changes (status, payment, delivery date, visible comments) appear on the customer's timeline. Use private notes for internal text.
- Repeating the same value returns `changed: false`.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 409 `INVALID_TRANSITION` | The move is not adjacent. GET the order, use `nextStatus`, `prevStatus` or `Cancelled`. |
| 409 `STATUS_LOCKED` | The order is at its final status or has a return. Nothing to do: handle the return with `returnStatus`. |
| 400 `Nothing to change` | Only `customerVisible` or `restock` was sent. Add a real change. |
| 400 `Stock can be restored only for a cancelled order` | Cancel first. |
| 404 `NOT_FOUND` | Wrong number or id, or the order belongs to another store. |
