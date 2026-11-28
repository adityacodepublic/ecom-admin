-- Untracked stock and optional per-order limit: Product.quantity and Product.maxQuantity may be NULL.
-- quantity = NULL means stock is not tracked (always available, never decremented or restored).
-- maxQuantity = NULL means no per-order limit.
-- Run once on Neon BEFORE deploying the matching code (admin first, then the store). Safe to run twice.
-- Rollback (only while no product has NULL values):
--   ALTER TABLE "Product" ALTER COLUMN "quantity" SET NOT NULL, ALTER COLUMN "maxQuantity" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "quantity" DROP NOT NULL, ALTER COLUMN "maxQuantity" DROP NOT NULL;
