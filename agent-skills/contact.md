# Contact

How customers reach the store (Call and WhatsApp buttons on order pages). Router: `{{BASE}}/skill/index`.

## Endpoint

`PATCH {{BASE}}/contact` returns `{ contact: { phone, whatsapp, email } }` (the full merged contact).

There is no `GET /contact`. Read the current `phone` and `whatsapp` from `GET {{BASE}}/order-settings` (`settings.contact`). `email` cannot be read through the agent link.

## Body

Send any subset. Omitted fields stay unchanged. Unknown keys return 400.

```
PATCH {{BASE}}/contact
{ "phone": "+91 98765 43210", "whatsapp": "919876543210", "email": "help@example.com" }
```

| Field | Rule |
| --- | --- |
| `phone` | String, trimmed, at most 100 characters. `""` clears it. |
| `whatsapp` | Digits with country code and no `+` (`919876543210`), because it builds a `wa.me` link. At most 100 characters. The route does not check the format. |
| `email` | A valid email or `""`, at most 100 characters. |

## Failure and fix

| Symptom | Fix |
| --- | --- |
| 400 `Invalid input` on `email` | Send a valid address or `""`. |
| 400 `Unrecognized key(s) in object` | Remove keys other than `phone`, `whatsapp`, `email`. |
| 400 `String must contain at most 100 character(s)` | Shorten the value. |
