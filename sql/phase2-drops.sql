-- Phase 2: remove two old, unused columns. Run on Neon only AFTER the new code is deployed
-- (the old code still wrote Order.isPaid and needed Users.storeId).
-- Rollback is not possible for the data in these columns: neither is read by any code.

BEGIN;

ALTER TABLE "Order" DROP COLUMN IF EXISTS "isPaid";

ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS "Users_storeId_fkey";
DROP INDEX IF EXISTS "Users_storeId_idx";
ALTER TABLE "Users" DROP COLUMN IF EXISTS "storeId";

COMMIT;
