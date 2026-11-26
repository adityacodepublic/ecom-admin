-- Custom domains: the owner's own hostname for the storefront (lib/custom-domain.ts), e.g. "shop.mybrand.com".
-- Run once on Neon BEFORE deploying the matching code: Prisma selects every Store column by default, so any
-- store.find* without a `select` fails until the column exists. Safe to run twice.
-- Rollback: DROP INDEX IF EXISTS "Store_customDomain_key"; ALTER TABLE "Store" DROP COLUMN IF EXISTS "customDomain";
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;

-- One store per hostname. Same name Prisma gives @unique, so `prisma db pull` / `migrate diff` see no drift.
CREATE UNIQUE INDEX IF NOT EXISTS "Store_customDomain_key" ON "Store"("customDomain");

-- Verified flag: true only once Vercel reports the domain's DNS as live (lib/store-domain.ts keeps it current).
-- The storefront redirects platform URLs to the custom domain and uses it for canonical URLs only while this is true,
-- so a domain that is typed but not yet pointed at Vercel never takes the store's traffic away.
-- Domains connected before this column existed start as false; each flips to true the next time its owner opens
-- Settings > Custom domain (the status check re-verifies it).
-- Rollback: ALTER TABLE "Store" DROP COLUMN IF EXISTS "customDomainVerified";
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "customDomainVerified" BOOLEAN NOT NULL DEFAULT false;
