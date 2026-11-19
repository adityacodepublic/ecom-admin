import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { defaultLayouts, PAGES, pageLayoutSchemas, type PageLayout, type PageName } from "@/lib/home-layout";
import { storeUrl } from "@/lib/store-url";
import { PagesEditor } from "./components/pages-editor";

// Products offered to preview the product page with (the newest ones; a store rarely needs more to check a layout).
const PREVIEW_PRODUCTS = 100;

const PagesPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const [store, categories, products] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, pageLayouts: true } }),
    prismadb.category.findMany({ where: { storeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prismadb.product.findMany({ where: { storeId, isArchived: false }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: PREVIEW_PRODUCTS }),
  ]);
  if (!store) notFound();

  // No saved layout, or one that no longer matches the schema: the page's default (what the store shows then).
  const saved = (store.pageLayouts ?? {}) as Partial<Record<PageName, unknown>>;
  const layouts = Object.fromEntries(
    PAGES.map((page) => {
      const parsed = pageLayoutSchemas[page].safeParse(saved[page] ?? defaultLayouts[page]);
      return [page, parsed.success ? (parsed.data as PageLayout) : defaultLayouts[page]];
    }),
  ) as Record<PageName, PageLayout>;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PagesEditor
          layouts={layouts}
          storeUrl={storeUrl(store.slug)}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          products={products.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
    </div>
  );
};

export default PagesPage;
