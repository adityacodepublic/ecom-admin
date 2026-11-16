/**
 * One-time: gives every existing store without a slug a unique slug made from its name
 * ("STORE" -> "store-shop" because "store" is reserved; a clash gets -2, -3 here only).
 * Runs BETWEEN phase 1 (slug column added, nullable) and phase 2 (slug NOT NULL). See NEON-STEPS.
 *
 * It uses raw SQL only, not the Prisma model API: the generated client says slug is required
 * (and has no "url"), which does not match the database at this point. Raw SQL works with both.
 * It needs nothing but the "Store" table with "id", "name", "slug", "createdAt".
 *
 *   npx tsx scripts/backfill-store-slugs.ts            # dry run: print the list, write nothing
 *   npx tsx scripts/backfill-store-slugs.ts --apply    # write it
 *
 * It uses DATABASE_URL from the environment (Prisma reads .env, NOT .env.local).
 * It prints the database host first: check it before --apply.
 */
import { PrismaClient } from "@prisma/client";

import { RESERVED_SLUGS, SLUG_MAX, SLUG_MIN, isValidSlug, slugify } from "../lib/slug";

// The clash fallback lives ONLY here, for this one-time backfill. New stores never get an
// auto-changed slug: the owner picks one and a clash is an error.
function baseSlug(name: string): string {
  let base = slugify(name);
  if (base.length < SLUG_MIN || RESERVED_SLUGS.has(base)) base = base ? `${base}-shop` : "my-shop";
  return isValidSlug(base) ? base : "my-shop";
}
function slugCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
}

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type Row = { id: string; name: string; slug: string | null };

async function main() {
  let host = "(unknown)";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").host;
  } catch {}
  console.log(`Database host: ${host}   mode: ${apply ? "APPLY" : "dry run"}\n`);

  const stores = await prisma.$queryRaw<Row[]>`SELECT "id", "name", "slug" FROM "Store" ORDER BY "createdAt" ASC`;
  const used = new Set(stores.map((s) => s.slug).filter((s): s is string => !!s));
  const plan: { id: string; name: string; slug: string }[] = [];

  for (const store of stores) {
    if (store.slug) continue;
    const base = baseSlug(store.name);
    let n = 1;
    let slug = slugCandidate(base, n);
    while (used.has(slug) || !isValidSlug(slug)) slug = slugCandidate(base, ++n);
    used.add(slug);
    plan.push({ id: store.id, name: store.name, slug });
  }

  console.table(plan);
  console.log(`${stores.length} stores, ${plan.length} need a slug.`);

  if (apply && plan.length) {
    // One transaction: all or nothing. "slug IS NULL" so a store that got a slug meanwhile is left alone;
    // the unique index rejects a clash and rolls everything back (run again then).
    const written = await prisma.$transaction(
      plan.map((row) => prisma.$executeRaw`UPDATE "Store" SET "slug" = ${row.slug} WHERE "id" = ${row.id} AND "slug" IS NULL`),
    );
    console.log(`Written: ${written.reduce((a, b) => a + b, 0)} rows.`);
  }
}

main().finally(() => prisma.$disconnect());
