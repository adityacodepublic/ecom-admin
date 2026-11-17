-- Order statuses become plain text (the store owner's own list). Run once on Neon BEFORE deploying.
-- Old codes become the default labels. "Order Recieved" (the old typo) becomes Placed.

BEGIN;

UPDATE "Order" SET status = CASE status
  WHEN 'PLACED' THEN 'Placed'
  WHEN 'Order Recieved' THEN 'Placed'
  WHEN 'CONFIRMED' THEN 'Confirmed'
  WHEN 'PACKED' THEN 'Packed'
  WHEN 'SHIPPED' THEN 'Shipped'
  WHEN 'OUT_FOR_DELIVERY' THEN 'Out for delivery'
  WHEN 'DELIVERED' THEN 'Delivered'
  WHEN 'CANCELLED' THEN 'Cancelled'
  ELSE status
END;

ALTER TABLE "Order" ALTER COLUMN status SET DEFAULT 'Placed';

-- The same renames inside each order's timeline events.
UPDATE "Order" o
SET details = jsonb_set(
  o.details::jsonb,
  '{events}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN e ? 'status' THEN jsonb_set(e, '{status}', to_jsonb(CASE e->>'status'
          WHEN 'PLACED' THEN 'Placed'
          WHEN 'CONFIRMED' THEN 'Confirmed'
          WHEN 'PACKED' THEN 'Packed'
          WHEN 'SHIPPED' THEN 'Shipped'
          WHEN 'OUT_FOR_DELIVERY' THEN 'Out for delivery'
          WHEN 'DELIVERED' THEN 'Delivered'
          WHEN 'CANCELLED' THEN 'Cancelled'
          ELSE e->>'status'
        END))
        ELSE e
      END ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(o.details::jsonb->'events') WITH ORDINALITY AS t(e, ord)
  )
)
WHERE jsonb_typeof(o.details::jsonb->'events') = 'array';

COMMIT;
