# Filters (product attributes)

A filter is a named attribute (such as `Color`, `RAM`, or `Storage`) with a list of option items. Products link to individual option items by `valueId`. The store has no built-in size or color columns, so model them as filters. Router: `{{BASE}}/skill/index`.

## Before you write

1. Call `GET {{BASE}}/filters?page=1&pageSize=100` to see existing filter names, filter ids, and option `id` values.
2. Warning: `PATCH {{BASE}}/filters/{id}` replaces the entire option list. Omitting an existing option's `id`, or sending `"value": []`, deletes the old option rows and breaks every product's link to them. Always read `GET {{BASE}}/filters/{id}` first and keep existing option `id` values.
3. For numeric attributes (such as `128 GB` or `8 GB`), put the number in the item's `value` field and the unit text in `unit` (`{ "value": 128, "unit": "GB" }`). Follow the pattern of existing items on that filter.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET {{BASE}}/filters` | Optional `?page=1&pageSize=50` | Plain array `[{ id, name, value: [{ id, value, unit }] }]`, or `{ items, page, pageSize, hasMore }` when `page` is set (`pageSize` above 100 clamps to 100). |
| `GET {{BASE}}/filters?name=<exact>` | Exact case-sensitive name | One filter `{ id, name, value: [{ id, value, unit }] }` or `null`. |
| `GET {{BASE}}/filters/{id}` | None | `{ id, name, value: [{ id, value, unit }] }` or `null`. |
| `POST {{BASE}}/filters` | `{ name, value: [item, ...] }` | Filter row `{ id, storeId, name, createdAt, updatedAt }` with **no** option items. Call `GET` afterward to read option `id` values. |
| `PATCH {{BASE}}/filters/{id}` | `{ name, value: [item, ...] }` | Updated filter row with **no** option items. |
| `DELETE {{BASE}}/filters/{id}` | None | Deleted filter row. Also deletes its options and all product links to them; products remain. |

In `GET` responses, each item's numeric `value` is returned as a string (such as `"128"`) or `null`.

## Fields

Note the two uses of the word `value`: the top-level `value` field is the array of option items; inside each item, `value` is the optional numeric amount.

| Field | Type | Required | Rules and limits | On PATCH if omitted, empty, or null |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | Unique within this store (exact case-sensitive check). Avoid creating two names that differ only by case (such as `RAM` and `ram`), because storefront filter URLs lowercase the name. | Omitting or `""` returns `400`. |
| `value` (top-level array) | array | Yes | Array of option items. Extra item keys are ignored. | Omitting returns `400`. **Sending `[]` deletes every option and breaks every product link to this filter.** |
| `value[].id` | string | PATCH only | Existing option `id` from `GET`. Keeps that option in place so products stay linked even if you rename its `value` or `unit`. | Omitting `id` (or sending an id from another filter) creates a new option row and deletes the old one, breaking product links. |
| `value[].value` | number or `null` | No | Optional numeric part (such as `128` for `128 GB`). Avoid `0` because the storefront hides falsy numbers. Non-numeric strings return `400`. | Omitting or `null` stores a text-only option. |
| `value[].unit` | string | Yes | Required text label (such as `"GB"` or `"Red"`). The storefront joins `[value, unit]` with a space. | Omitting returns `400`. |

## Examples

### Create a text-only filter (Color)

```json
{
	"name": "Color",
	"value": [
		{ "unit": "Red" },
		{ "unit": "Blue" }
	]
}
```

### Create a numeric-plus-unit filter (Storage)

Put the number in `value` and the unit text in `unit`.

```json
{
	"name": "Storage",
	"value": [
		{ "value": 128, "unit": "GB" },
		{ "value": 256, "unit": "GB" }
	]
}
```

### Add one option to an existing filter without breaking product links

Send every existing option with its `id` from `GET {{BASE}}/filters/{id}`, and omit `id` only on the new option.

```json
{
	"name": "Color",
	"value": [
		{ "id": "val_1", "unit": "Red" },
		{ "id": "val_2", "unit": "Blue" },
		{ "unit": "Green" }
	]
}
```

## Steps

### Create a filter and get option ids

1. Call `GET {{BASE}}/filters?page=1&pageSize=100` to check the name is not taken.
2. Send `POST {{BASE}}/filters` with `{ name, value }`.
3. Call `GET {{BASE}}/filters/{id}` (using the `id` from the `POST` response) to read the generated `value[].id` values.
4. Attach options to products using `filteritems: [{ "valueId": "<id>" }]` in `{{BASE}}/skill/products`.

### Add, rename, or remove filter options

1. Call `GET {{BASE}}/filters/{id}` to read the current `name` and all `value[]` items with their `id` values.
2. Keep every option you want to preserve with its exact `id`. Edit its `value` or `unit` in place to rename it without breaking product links.
3. Add new options without an `id`.
4. Confirm with the user before omitting any existing option or sending `value: []`, because linked products will lose that attribute.
5. Send `PATCH {{BASE}}/filters/{id}`.
6. Verify with `GET {{BASE}}/filters/{id}`.

## Errors

| Status | Message | Fix |
| --- | --- | --- |
| `400` | `Name is required` / `Value is required` | Send both `name` and `value` (as an array). |
| `400` | `Each value needs a numeric value (or none) and a unit` | Ensure every item has string `unit` and either a valid number, `null`, or omitted `value`. |
| `404` | `Not found` | Wrong filter id or filter belongs to another store. |
| `409` | `A filter with this name already exists` | Pick another filter name in this store. |
| Products lost an attribute after `PATCH` | None | An existing option was omitted or sent without its `id`. Re-attach the new `valueId` on affected products with `PATCH {{BASE}}/products/{id}`. |

## Related skills

| When you need to | Read |
| --- | --- |
| Attach filter `valueId` values to products or re-attach lost links | `{{BASE}}/skill/products` |
