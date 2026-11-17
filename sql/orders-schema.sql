-- Brings an older database (before the orders rewrite) up to the current Prisma schema for orders.
-- Run FIRST, then store-contact.sql, then order-statuses.sql.
-- The new Order columns are NOT NULL with no default, so this only works while the "Order" table is empty
-- (it stops with an error and changes nothing otherwise).

BEGIN;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER NOT NULL,
  ADD COLUMN IF NOT EXISTS "total" DECIMAL(12,2) NOT NULL,
  ADD COLUMN IF NOT EXISTS "details" JSONB NOT NULL,
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "Order" ALTER COLUMN "payment" SET DEFAULT 'COD';

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "orderSettings" JSONB;

ALTER TABLE "Users" ALTER COLUMN "storeId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_storeId_status_idx" ON "Order"("storeId", "status");
CREATE INDEX IF NOT EXISTS "Order_storeId_paymentStatus_idx" ON "Order"("storeId", "paymentStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_storeId_orderNumber_key" ON "Order"("storeId", "orderNumber");

COMMIT;
