# Filters (product attributes)

A filter is a named attribute (for example `RAM`, `Color`) with a list of values. Products link to values. The schema has no sizes or colors: model them as filters. Router: `{{BASE}}/skill/index`.

Each value is `{ value?: number, unit: string }`. `RAM` could have `{ "value": 8, "unit": "GB" }`. `Color` could have `{ "unit": "Red" }` with no number.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET {{BASE}}/filters` | | `[{ id, name, value: [{ id, value, unit }] }]` Large stores: use ?page=&pageSize= on lists (`?page=1&pageSize=50` returns `{ items, page, pageSize, hasMore }`). |
| `GET {{BASE}}/filters?name=RAM` | | one filter (same shape) or `null`. Looks up by name in this store. |
| `GET {{BASE}}/filters/{id}` | | `{ id, name, value: [{ id, value, unit }] }` |
| `POST {{BASE}}/filters` | `{ name, value: [{ value?, unit }] }` | `{ id, storeId, name, createdAt, updatedAt }` (no values) |
| `PATCH {{BASE}}/filters/{id}` | `{ name, value: [{ id?, value?, unit }] }` | the filter row (no values) |
| `DELETE {{BASE}}/filters/{id}` | | the deleted filter |

After creating, call `GET {{BASE}}/filters` to read the value ids (values are returned with their `id`). Products attach by `valueId`.

```
POST {{BASE}}/filters
{ "name": "Color", "value": [ { "unit": "Red" }, { "unit": "Blue" } ] }
```

## Rules and caveats

- `name` is required and unique within this store (another store may use the same name). A duplicate returns 409 `A filter with this name already exists`; pick another name such as `Phone color`.
- `value` must be present. On POST each item may contain only `value` (number or null) and `unit` (string); extra keys such as `storeId` cause 500. On PATCH each item is `{ id?, value?, unit }`; `id` is optional.
- `unit` is required per item.
- PATCH sends the full list of values. A value's identity is its `id`, never its text. Send the `id` (from GET) to keep a value: it is updated in place, so changing its `value`/`unit` renames it and products stay linked. Omit `id` to add a new value (an `id` that is not this filter's is also treated as new). An existing value left out of the list is deleted, and products lose the link to it only. To add one option, send the existing ones with their `id`s plus the new one without an `id`.
- DELETE removes the filter, its values and every product link to them. Products stay.

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Name is required` / `Value is required` | Send both. |
| 409 `A filter with this name already exists` | Use another name in this store. |
| 500 `Internal error` on POST | An item has an unexpected key or no `unit`. |
| Products lost an attribute after PATCH | That value was left out of the list, or was sent without its `id` (treated as a new value; the old one is deleted). Re-attach with `PATCH {{BASE}}/products/{id}`. |
