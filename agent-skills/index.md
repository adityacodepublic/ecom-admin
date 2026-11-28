# Store admin agent: start here

You operate one store's admin API through a secret base URL: `{{BASE}}`. The token in that URL is the only credential. Send no other auth header. Never print or save the URL outside this session. This start page is reachable at both `{{BASE}}/skill` and `{{BASE}}/skill/index`.

Paths mirror the admin API without `/api/{storeId}`, such as `GET {{BASE}}/products` and `PATCH {{BASE}}/products/{id}`. The token identifies the store.

## Public storefront

The store's public website is `{{STORE_URL}}`. Open it to inspect what customers see after your changes.

- Home: `{{STORE_URL}}`
- Category: `{{STORE_URL}}/category/{categoryId}`
- Product: `{{STORE_URL}}/product/{productId}`
- Search: `{{STORE_URL}}/search/{text}`
- Cart and checkout: `{{STORE_URL}}/cart`, `{{STORE_URL}}/checkout`
- Customer orders: `{{STORE_URL}}/orders`, `{{STORE_URL}}/orders/{orderId}`
- Custom pages: `{{STORE_URL}}/<route>`

## Skills

Read only the skill files your task needs.

| Task | Read |
| --- | --- |
| Categories: name, thumbnail (`imageUrl`), and category billboard images (`banner`) | `{{BASE}}/skill/categories` |
| Products: price (including price on request), stock, images, descriptions, archiving | `{{BASE}}/skill/products` |
| Product attributes (Color, RAM, Storage) and their values | `{{BASE}}/skill/filters` |
| Page layouts (`home`, `category`, `product`), custom pages, Billboards, Category billboard display settings, Product lists, Markdown blocks | `{{BASE}}/skill/pages` |
| Custom components: HTML, Tailwind CSS, JavaScript, `STORE_DATA` queries, sandbox rules, previews | `{{BASE}}/skill/custom-block` |
| Site-wide navbar and footer HTML | `{{BASE}}/skill/chrome` |
| Store name, logo, wordmark mode (`logoOnly`), and browser-tab favicon | `{{BASE}}/skill/branding` |
| Store phone, WhatsApp, email, and business street address | `{{BASE}}/skill/contact` |
| Read orders, move statuses, handle returns, add notes, restore stock | `{{BASE}}/skill/orders` |
| Order status list, cancellation rules, return rules, checkout payment step, quote ("Price on request") labels, product page buttons | `{{BASE}}/skill/order-settings` |
| Upload images (max 6 MB), list the image library, delete unused images | `{{BASE}}/skill/media` |
| Look up customer profiles and list a customer's orders | `{{BASE}}/skill/users` |

## Modes (`full` and `permission`)

The store owner chooses one mode when creating the link.

- **`full`**: every call runs at once.
- **`permission`**: reads and direct uploads run at once. Other writes return `202` and wait for owner approval.

### What runs at once in permission mode

| Call | Behavior in permission mode |
| --- | --- |
| Any `GET` (including `GET /page-layouts/data` and `GET /requests/{id}`) | Runs at once |
| `POST /upload-url` | Runs at once |
| Direct multipart upload to Cloudinary `uploadUrl` | Runs at once |
| `POST /media` with `"source": "upload"` | Runs at once |
| `POST /media` with `"source": "url"` (or missing `source`) | Returns `202` |
| Any other `POST`, `PATCH`, `PUT`, or `DELETE` | Returns `202` |

Exception: invalid `/page-layouts` writes (bad route, duplicate route, missing custom page, invalid block schema) fail at once with `400`, `404`, or `409` instead of returning `202`.

### Approval loop in permission mode

A queued write returns `202`:

```json
{
	"requestId": "ab12...",
	"status": "pending",
	"approveUrl": "https://.../agent-requests/ab12...",
	"expiresInMinutes": 30,
	"message": "..."
}
```

1. Send independent writes together so the owner reviews them in one round.
2. Never send a dependent write in the same round as the write it depends on. You do not have the new id or route until the first request is approved and its `result.body` arrives.
   Example (creating a category, updating contact, then creating two products in that category):
   - **Immediate (0 approval rounds):** `POST /upload-url`, Cloudinary upload, `POST /media` with `"source": "upload"`.
   - **Approval round 1:** send `POST /categories` and `PATCH /contact` together. Wait for approval and read the new category `id` from `result.body.id`.
   - **Approval round 2:** send both `POST /products` calls together using that `categoryId`. Wait for approval.
   Same rule for custom pages: `POST /page-layouts` in round 1, wait for approval, then `PUT /page-layouts/<route>` in round 2.
3. Give the user every `approveUrl` and ask them to Allow or Deny.
4. Poll `GET {{BASE}}/requests/{requestId}` every few seconds. It returns `{ "id", "status", "result"? }`.
5. Handle `status`:
   - `pending`: keep polling.
   - `denied`: nothing changed. Stop and do not retry unless the user asks.
   - `approved` without `result`: still executing. Keep polling.
   - `failed` without `result`: still executing. Keep polling.
   - `approved` with `result`: the write succeeded. Read ids from `result.body`.
   - `failed` with `result`: the write did not happen. Read the error from `result.body`.
6. If `result.body` is over about 10 KB, the server stores `{ "truncated": true, "preview": "<first 10,000 chars of JSON>" }`. Read the id from `preview`, or `GET` the resource.
7. If polling returns `404`, the request expired (30 minutes after sending if pending, or 30 minutes after the decision). Always `GET` the resource to check whether the write happened before sending it again.

The pending queue holds up to 2 MB across all waiting requests. If a write returns `413`, wait for the owner to decide on pending requests or for older ones to expire after 30 minutes.

## Where each setting lives

| Setting | Stored in | Endpoint | Skill |
| --- | --- | --- | --- |
| Categories (`name`, `imageUrl`, `banner`) | `Category` table | `/categories` | `categories` |
| Products (`name`, `price`, `quantity`, `images`, `filteritems`) | `Product` table | `/products` | `products` |
| Filters (`name`) and values (`value`, `unit`) | `Filter`, `Value` tables | `/filters` | `filters` |
| Page block arrays (`home`, `category`, `product`, `custom`) | `Store.pageLayouts` | `/page-layouts` | `pages`, `custom-block` |
| Navbar and footer HTML (`navbarHtml`, `footerHtml`) | `Store.settings` | `/chrome` | `chrome` |
| Store `name`, `logo`, `logoOnly`, `favicon` | `Store.name`, `Store.settings` | `/branding` | `branding` |
| Store `phone`, `whatsapp`, `email`, `address` | `Store.settings.contact` | `/contact` | `contact` |
| Order statuses, cancellation, returns, checkout, quote labels, product page buttons | `Store.settings.orders` | `/order-settings` | `order-settings` |
| Orders and returns | `Order` table | `/orders` | `orders` |
| Image library | `MediaImage` table | `/media` | `media` |
| Customer profiles | `Users` table | `/users` | `users` |

Create catalog records in this order: category, then optional filters, then product. Delete in reverse order. The schema has no built-in size or color columns. Model them as filters (`{{BASE}}/skill/filters`).

## Fetch these first

Never guess ids. Run these reads before writing:

1. `GET {{BASE}}/categories?page=1&pageSize=100`
2. `GET {{BASE}}/filters?page=1&pageSize=100`
3. `GET {{BASE}}/products?page=1&pageSize=100`
4. `GET {{BASE}}/order-settings` (for order statuses, quote labels, and product page buttons)
5. The skill file for your task.

## Global rules

- **JSON headers and size**: send `Content-Type: application/json` on every JSON body. Request bodies are limited to 400,000 characters (`413 Body is too large`).
- **Response size limit**: `GET` responses over about 3.5 MB return `413 Response too large. Use ?page=1&pageSize=50`.
- **Paging schemes differ by route**:
  - `GET /products`, `GET /categories`, `GET /filters`: `?page=1&pageSize=50` is optional. With `page`, the response is `{ "items", "page", "pageSize", "hasMore" }` sorted by `id`, and `pageSize` above 100 is clamped to 100. Without `page`, the response is a plain array in no guaranteed order.
  - `GET /users`: 1-based `page`, `pageSize` 1 to 100 (default 50). Values over 100 return `400`.
  - `GET /orders`: 1-based `page`, `pageSize` 1 to 100 (default 20). Bad values return `400`.
  - `GET /media`: 0-based `page` (`0`, `1`, `2`), fixed 40 items per page.
- **Money units differ by route**:
  - Product `price` and order-list `minTotal` and `maxTotal` filters use rupees (`499` or `"499.50"`).
  - Order response fields (`totalPaise`, `revenuePaise`, `amountPaise`) use integer paise (`49900` is 499.00 rupees).
- **PATCH rules vary by route**: check each skill's Fields table before sending a `PATCH`. Some fields stay unchanged when omitted, while others (such as product `images` and `filteritems`, or filter `value`) replace the whole list.
- **Text over a field limit**: count characters before sending. If the user's text is too long, propose a shorter version and ask. If you cannot ask, send the closest version that fits and tell the user what you changed. Never drop the field.
- **Error shapes**: through this agent link, errors are either `{ "error": "<text>" }` or `{ "error": { "code", "message", "details" } }`. Do not retry a `500` error blindly. Check the skill's error table first.
- **Unreachable paths**: routes outside the allowed list (such as `stores`, `analytics`, `domain`, `orders/{id}/quote`, `customer`, `webhook`) return `403`, `404`, or `405`.
- **Confirm destructive actions**: never delete records, clear lists, or overwrite custom layouts or HTML unless the user asked.
