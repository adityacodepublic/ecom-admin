-- Category and product page layouts: one JSON column on Store, { "category": [...], "product": [...] }.
-- (The home page layout stays in "homeLayout".) Run once on Neon BEFORE deploying the matching code. Safe to run twice.
-- Rollback: ALTER TABLE "Store" DROP COLUMN "pageLayouts";
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pageLayouts" JSONB;
