-- Filter names are unique per store, not across all stores.
BEGIN;
DROP INDEX IF EXISTS "Filter_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Filter_storeId_name_key" ON "Filter"("storeId","name");
COMMIT;
