-- Store transfer: one JSON column on Store holds the pending hand-over (hashed token, recipient email, created time).
-- Run once on Neon BEFORE deploying the matching code. Safe to run twice.
-- Rollback: ALTER TABLE "Store" DROP COLUMN "transfer";
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "transfer" JSONB;
