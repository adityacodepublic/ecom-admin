# Store admin agent: start here

You operate one store's admin through a secret URL. Base URL: `{{BASE}}`. The token inside it is the only credential. Send no other auth header. Never print or store the URL outside this session.

Paths mirror the admin API without `/api/{storeId}`: `GET {{BASE}}/products`, `PATCH {{BASE}}/products/{id}`. The store is implied. You cannot reach other stores, the store URL or deletion, customer routes or the webhook (403/404).

## The storefront

The store's public website is `{{STORE_URL}}`. It is public: open it, browse it and use it freely (cart, checkout and search work as for any customer; orders and the profile need a customer sign-in). Pages: home `{{STORE_URL}}`, a category `{{STORE_URL}}/category/{categoryId}`, a product `{{STORE_URL}}/product/{productId}`, search `{{STORE_URL}}/search/{text}`, the cart `{{STORE_URL}}/cart`, checkout `{{STORE_URL}}/checkout`, your orders `{{STORE_URL}}/orders` and one order `{{STORE_URL}}/orders/{orderId}`. The owner's custom pages are at `{{STORE_URL}}/<route>`. Changes you make here show up there, so open the storefront to see what customers see.

## Skills (read only what the task needs)

| Task | Read |
| --- | --- |
| Categories (name, thumbnail, category billboard) | `{{BASE}}/skill/categories` |
| Products, stock, price, images | `{{BASE}}/skill/products` |
| Product attributes (RAM, weight...) | `{{BASE}}/skill/filters` |
| Orders, status, payment, returns | `{{BASE}}/skill/orders` |
| Status lists, cancellation, returns rules | `{{BASE}}/skill/order-settings` |
| Phone, WhatsApp, email | `{{BASE}}/skill/contact` |
| Store name and logo | `{{BASE}}/skill/branding` |
| Navbar and footer HTML | `{{BASE}}/skill/chrome` |
| Page layouts (home, category, product) and custom pages at their own route: Billboards, product lists, custom HTML blocks | `{{BASE}}/skill/pages` |
| Uploading or listing images | `{{BASE}}/skill/media` |
| Customer ids | `{{BASE}}/skill/users` |

## Two modes (the owner chose one when creating the link)

- `full`: every call runs immediately.
- `permission`: reads (GET) run immediately. Writes (POST, PATCH, PUT, DELETE) are not executed. You get `202`:
  `{ "requestId": "ab12...", "status": "pending", "approveUrl": "https://.../agent-requests/ab12...", "expiresInMinutes": 30, "message": "..." }`
  1. Give the user `approveUrl` and ask them to Allow or Deny.
  2. Poll `GET {{BASE}}/requests/{requestId}` every few seconds. It returns `{ id, status, result? }`.
  3. `status` is one of:
     - `pending`: the owner has not decided yet. Keep polling.
     - `denied`: the owner said no. Nothing was changed. Do not retry unless the user asks.
     - `approved`: the owner allowed it and the route ran and returned a status below 400. The write happened.
     - `failed`: the owner allowed it, but the route returned an error status (400 or higher) or the executor threw. The write did not happen.
     `result` is `{ status, body }`, the real response of the route (body may be truncated at about 10 KB). Read ids you need from `result.body`; on `failed` read the error from it. `approved` or `failed` WITHOUT `result` means it is still executing: keep polling.
  4. If the poll returns `404 { "error": "Request expired or unknown" }`, the request is gone: a pending request expires 30 minutes after it was sent, a decided one stays for 30 minutes after the decision. Before sending the write again, GET the resource to check whether the write already happened.
- Image uploads run immediately in both modes: `POST {{BASE}}/upload-url` (signed data), then upload the file (max 6 MB) straight to Cloudinary, then `POST {{BASE}}/media` with `source: "upload"`. Details and curl example in `{{BASE}}/skill/media`.
- There is no limit on how many writes you may send, but the owner's waiting list has a size limit (about 2 MB in total). If a write returns `413`, wait for the owner to decide on the pending requests (or for older ones to expire after 30 minutes), then send it again.
- Steps that need an id from an earlier write must wait for that request to be approved. Send independent writes together and ask for one approval round.

## Fetch these first

1. `GET {{BASE}}/categories`, `GET {{BASE}}/filters`, `GET {{BASE}}/products` to learn existing ids. Never guess ids.
2. `GET {{BASE}}/order-settings` for the status list the store uses.
3. The skill file for the task.

## Data model

```
Category(name, imageUrl = thumbnail, banner = [{url, href}] its billboard)
   ^ categoryId (required)
Product(name, price, quantity, maxQuantity, isFeatured, isArchived, description)
   -> images[{url, order}]            (at least 1)
   -> filteritems -> Value(value, unit) -> Filter(name)   (optional attributes)
Order (read + status updates only) -> items reference Product, customer = Users
Store JSON: settings (orders, contact, logo, navbarHtml, footerHtml), pageLayouts (home, category and product pages, and custom pages by route; billboard
            banners are "carousel" blocks there, with their images inside)
MediaImage: the image library (url, source "upload" | "url")
```

The schema has no sizes or colors. Use filters for attributes: a Filter `Color` with Values such as `{ "unit": "Red" }`, `{ "unit": "Blue" }`.

Create order: category, then (optional) filter, then product. Delete in reverse order.

## Rules for every call

- Send `Content-Type: application/json` with JSON bodies. Money is rupees as a number or string with at most 2 decimals (`499`, `"499.50"`).
- Image fields hold plain `https://` URLs. Get one with `POST {{BASE}}/upload-url` + a direct Cloudinary upload (max 6 MB, see media) or reuse an existing https URL (`POST {{BASE}}/media { "url": "https://...", "source": "url" }`).
- Responses over about 3.5 MB are refused with `413 { "error": "Response too large. Use ?page=1&pageSize=50" }`. On the lists `products`, `categories` and `filters`, add `?page=1&pageSize=50` (pageSize max 100, default 50). With `page` the answer is `{ "items": [...], "page", "pageSize", "hasMore" }` instead of a plain array; keep requesting the next `page` while `hasMore` is true. Without `page` you get the full plain array as before. Request bodies are limited to 400 KB.
- PATCH on categories, products and filters is a full replace of the listed fields. Send every required field, not only the changed one. GET the record first and send it back modified.
- Errors: older routes return a plain-text body (`Name is required`, `Internal error`) with 400/401/403/500. Orders, order-settings, contact, branding and chrome return `{ "error": { "code", "message", "details" } }`. Proxy errors return `{ "error": "..." }`.
- `403` from a feature route means the store/owner check failed.
- Do not retry a `500 Internal error` blindly. Re-read the matching skill's failure table.
- If you have codemode like tools, then use them to compose different requests.
- Never delete data unless the user asked for it.
