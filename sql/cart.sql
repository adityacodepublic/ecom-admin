-- The shopper's cart, saved to their account (one row per product, per store). See lib/cart.ts.
-- Run once on Neon BEFORE deploying the matching admin code. Safe to run twice. Touches no existing table.
-- Rollback: DROP TABLE "CartItem";

CREATE TABLE IF NOT EXISTS "CartItem" (
  "id"         TEXT         PRIMARY KEY,
  "storeId"    TEXT         NOT NULL,
  "customerId" TEXT         NOT NULL, -- the store app's Clerk user id (no Users row needed)
  "productId"  TEXT         NOT NULL,
  "quantity"   INTEGER      NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_customerId_storeId_productId_key" ON "CartItem" ("customerId", "storeId", "productId");
CREATE INDEX IF NOT EXISTS "CartItem_storeId_idx" ON "CartItem" ("storeId");
CREATE INDEX IF NOT EXISTS "CartItem_productId_idx" ON "CartItem" ("productId");
