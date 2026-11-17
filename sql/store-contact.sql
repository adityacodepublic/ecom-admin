-- Moves the contact details out of Store."orderSettings" into their own column Store."contact".
-- Run once on Neon BEFORE deploying the matching code. Safe to run twice.
-- Rollback: ALTER TABLE "Store" DROP COLUMN "contact";  (the old values stay in "orderSettings" until step 3)

-- 1. the column
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "contact" JSONB;

-- 2. copy the existing values
UPDATE "Store"
SET "contact" = "orderSettings"->'contact'
WHERE "contact" IS NULL AND "orderSettings" ? 'contact';

-- 3. only after the new code is live and checked: remove the old copy
-- UPDATE "Store" SET "orderSettings" = "orderSettings" - 'contact' WHERE "orderSettings" ? 'contact';
