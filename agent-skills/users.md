# Users (customers)

Read-only lookup for customers who have placed at least one order in this store. Customer data is personal: share it only with the user and never copy it into public store fields. Router: `{{BASE}}/skill/index`.

## Endpoints

| Method and path | Query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/users` | `?page=1&pageSize=50` | `{ users: [{ id }], page, pageSize, totalCount, hasMore }`. Ids only. `page` starts at `1`; `pageSize` is `1` to `100` (default `50`; values over `100` return `400`). |
| `GET {{BASE}}/users/{id}` | None | `{ user: { id, fname, email, phone, imgurl, createdAt } }`, or `404` if the user has no order in this store. |

Writes (`POST`, `PATCH`, `DELETE`) are blocked for agents (`403 Agents may only GET "users"`). Only customers edit their own profiles.

## Steps

### Find all orders for one customer

Orders already include `customer: { id, fname, email, phone }`. Use the `buyer` filter on `GET {{BASE}}/orders` (`{{BASE}}/skill/orders`):

1. Call `GET {{BASE}}/orders?buyer={userId}&page=1&pageSize=100`. When `status` is omitted, cancelled orders are excluded and the response sets `excludesCancelled: true`.
2. If you also need cancelled orders for that customer, call `GET {{BASE}}/orders?buyer={userId}&status=Cancelled&page=1&pageSize=100`.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `page must be a whole number from 1 to 100000` / `pageSize must be a whole number from 1 to 100` | Pass valid integers within range. |
| `403` | `Agents may only GET "users"` | Do not send write requests to `/users`. |
| `404` | `Not found` | Wrong user id, or the user has no order in this store. |

## Related skills

| When you need to | Read |
| --- | --- |
| Filter or update a customer's orders | `{{BASE}}/skill/orders` |
