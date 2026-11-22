-- Splits the delivery address into street, city, state and country.
--   Address."value" becomes "street"; new columns "city", "state", "country".
--   Each order's frozen copy (Order.details.shipTo) gets the same fields: "address" becomes "street".
-- Run once on Neon BEFORE deploying the matching code (admin first, then the store). Safe to run twice.
-- Old addresses and orders have no city or state (they were typed into one text box): those stay "" and the
-- dashboard shows them as "Unknown". Nothing is guessed.
-- Rollback: rename "street" back to "value", drop the three columns; in details.shipTo put "street" back as "address".

-- 1. saved addresses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Address' AND column_name = 'value') THEN
    ALTER TABLE "Address" RENAME COLUMN "value" TO "street";
  END IF;
END $$;
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'India';

-- 2. the copy frozen on each order
UPDATE "Order"
SET "details" = jsonb_set(
  "details",
  '{shipTo}',
  ("details"->'shipTo') - 'address'
    || jsonb_build_object('street', "details"->'shipTo'->>'address', 'city', '', 'state', '', 'country', 'India')
)
WHERE "details"->'shipTo' ? 'address';
