-- Billboards become part of the blocks and categories that show them; all page layouts and all store settings get one column each.
--   Store."pageLayouts"  = { home, category, product }     (home moves here from Store."homeLayout")
--   Store."settings"     = { orders, contact, logo }        (from Store."orderSettings" and Store."contact")
--   Category."banner"    = [{ url, href }]                  (the category's billboard images, from its Billboard)
--   A carousel block keeps its images in its settings     (instead of a billboardId)
--   A "productGrid" block becomes a "productList" block with grid = true (limit = rows x columns)
-- Run steps 1 and 2 once on Neon BEFORE deploying the matching code. Safe to run twice (each copy only fills empty targets).
-- Then check: DATABASE_URL=<url> npx tsx scripts/check-page-layouts.ts   (every saved layout must parse; a bad one falls back to the default page)

BEGIN;

-- 1. new columns (the old ones stay until step 3, so the old code keeps working until the deploy)
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "settings" JSONB;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pageLayouts" JSONB;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "banner" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Category" ALTER COLUMN "billboardId" DROP NOT NULL; -- new categories have no billboard

-- 2a. settings
UPDATE "Store"
SET "settings" = COALESCE(CASE WHEN "orderSettings" IS NOT NULL THEN jsonb_build_object('orders', "orderSettings" - 'contact') END, '{}'::jsonb)
              || COALESCE(CASE WHEN "contact" IS NOT NULL THEN jsonb_build_object('contact', "contact") END, '{}'::jsonb)
WHERE "settings" IS NULL;

-- 2b. category billboards -> Category.banner
UPDATE "Category" c
SET "banner" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('url', bi."url", 'href', bi."href") ORDER BY bi."order", bi."id"), '[]'::jsonb)
  FROM "billboardImage" bi WHERE bi."billboardId" = c."billboardId"
)
WHERE c."banner" = '[]'::jsonb AND c."billboardId" IS NOT NULL;

-- 2c. home layout -> pageLayouts.home, with carousel images copied in and product grids turned into product lists.
--     A carousel whose billboard has no images (or was deleted) showed nothing and is dropped.
UPDATE "Store" s
SET "pageLayouts" = jsonb_set(COALESCE(s."pageLayouts", '{}'::jsonb), '{home}', (
  SELECT COALESCE(jsonb_agg(
    CASE e->>'type'
      WHEN 'productGrid' THEN jsonb_build_object(
        'id', e->'id',
        'type', 'productList',
        'settings', ((e->'settings') - 'rows') || jsonb_build_object(
          'grid', true,
          'limit', LEAST(24, COALESCE((e->'settings'->>'rows')::int, 2) * COALESCE((e->'settings'->>'columns')::int, 2))))
      WHEN 'carousel' THEN jsonb_set(e, '{settings}', ((e->'settings') - 'billboardId') || jsonb_build_object('images', (
        SELECT jsonb_agg(jsonb_build_object('url', bi."url", 'href', bi."href") ORDER BY bi."order", bi."id")
        FROM "billboardImage" bi WHERE bi."billboardId" = e->'settings'->>'billboardId')))
      ELSE e
    END ORDER BY t.ord), '[]'::jsonb)
  FROM jsonb_array_elements(s."homeLayout") WITH ORDINALITY AS t(e, ord)
  WHERE NOT (e->>'type' = 'carousel'
             AND NOT EXISTS (SELECT 1 FROM "billboardImage" bi WHERE bi."billboardId" = e->'settings'->>'billboardId'))
))
WHERE s."homeLayout" IS NOT NULL AND jsonb_typeof(s."homeLayout") = 'array'
  AND NOT (COALESCE(s."pageLayouts", '{}'::jsonb) ? 'home');

COMMIT;

-- 3. only after the new code is live and checked: remove what nothing reads any more
-- ALTER TABLE "Store" DROP COLUMN "homeLayout", DROP COLUMN "orderSettings", DROP COLUMN "contact";
-- ALTER TABLE "Category" DROP COLUMN "billboardId";
-- DROP TABLE "billboardImage";
-- DROP TABLE "Billboard";
--
-- Rollback (before step 3): ALTER TABLE "Store" DROP COLUMN "settings"; ALTER TABLE "Category" DROP COLUMN "banner";
--   UPDATE "Store" SET "pageLayouts" = "pageLayouts" - 'home';   (and redeploy the old code)
