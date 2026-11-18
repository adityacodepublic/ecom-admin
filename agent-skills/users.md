# Users (customers)

Read-only. Customers are people who have at least one order in this store. Router: `{{BASE}}/skill/index`.

| Method and path | Returns |
| --- | --- |
| `GET {{BASE}}/users` | `{ users: [{ id }], page, pageSize, totalCount, hasMore }`. Query: `page` (default 1), `pageSize` (default 50, max 100). Ids only. |
| `GET {{BASE}}/users/{id}` | `{ user: { id, fname, email, phone, imgurl, createdAt } }`. 404 `Not found` if the person has no order in this store. |

Writes (POST, PATCH, DELETE) are blocked for agents. Only the customer edits their own profile.

Orders already include each customer's `id, fname, email, phone` (`{{BASE}}/skill/orders`), so you rarely need these routes. To list one customer's orders, page through `GET {{BASE}}/orders` and filter by `customer.id` yourself: there is no customer filter.

Customer data is personal. Share it only with the user and do not copy it into other store fields.
