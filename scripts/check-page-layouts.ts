/**
 * Read-only check after sql/pages-billboards-settings.sql: every store's saved page layouts must parse with the
 * current schemas (a layout that does not parse silently falls back to the page's default on the store), every
 * category billboard must parse, and every store has its settings. Prints each problem; exits 1 if there is any.
 *   DATABASE_URL=<url> npx tsx scripts/check-page-layouts.ts
 */
import prismadb from "@/lib/prismadb";
import { billboardImagesSchema, PAGES, pageLayoutSchemas } from "@/lib/home-layout";

async function main() {
  console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host}`);
  let problems = 0;
  const stores = await prismadb.store.findMany({ select: { id: true, slug: true, pageLayouts: true, settings: true } });
  for (const s of stores) {
    const layouts = (s.pageLayouts ?? {}) as Record<string, unknown>;
    for (const page of PAGES) {
      if (layouts[page] === undefined || layouts[page] === null) {
        console.log(`ok    ${s.slug} ${page}: default`);
        continue;
      }
      const r = pageLayoutSchemas[page].safeParse(layouts[page]);
      if (r.success) console.log(`ok    ${s.slug} ${page}: ${r.data.map((b) => b.type).join(", ")}`);
      else {
        problems++;
        console.log(`FAIL  ${s.slug} ${page}: ${JSON.stringify(r.error.issues.slice(0, 3))}`);
      }
    }
    if (s.settings === null) console.log(`note  ${s.slug}: no settings (defaults)`);
  }
  const categories = await prismadb.category.findMany({ select: { id: true, name: true, banner: true } });
  for (const c of categories) {
    const r = billboardImagesSchema.safeParse(c.banner);
    if (!r.success) {
      problems++;
      console.log(`FAIL  category ${c.name} (${c.id}) banner: ${JSON.stringify(r.error.issues.slice(0, 2))}`);
    }
  }
  console.log(`${stores.length} stores, ${categories.length} categories, ${problems} problem(s)`);
  process.exit(problems ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
