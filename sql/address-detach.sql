-- A shopper can remove a saved address even when an order used it.
-- The address row stays (Order."addressId" must keep pointing at something), but it is detached from the shopper:
-- "usersId" becomes NULL, so it never shows in their saved list. Orders show their own frozen copy (details.shipTo).
-- Run once on Neon BEFORE deploying the matching code (admin first, then the store). Safe to run twice.
-- Rollback: only while no row has "usersId" NULL: ALTER TABLE "Address" ALTER COLUMN "usersId" SET NOT NULL;
ALTER TABLE "Address" ALTER COLUMN "usersId" DROP NOT NULL;
