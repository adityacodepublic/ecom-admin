import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { defaultLayouts, pageLayoutSchemas, type PageLayout, type PageName } from "@/lib/home-layout";
import { storeUrl } from "@/lib/store-url";
import { PagesEditor } from "./components/pages-editor";

// Products offered to preview the product page with (the newest ones; a store rarely needs more to check a layout).
const PREVIEW_PRODUCTS = 100;

const PagesPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const [store, billboards, categories, products] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, homeLayout: true, pageLayouts: true } }),
    prismadb.billboard.findMany({ where: { storeId }, select: { id: true, label: true }, orderBy: { label: "asc" } }),
    prismadb.category.findMany({ where: { storeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prismadb.product.findMany({ where: { storeId, isArchived: false }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: PREVIEW_PRODUCTS }),
  ]);
  if (!store) notFound();

  // A saved layout that no longer matches the schema starts from the page's default instead of breaking the page.
  // (The home page starts empty: the store shows only the category icons until a layout is saved.)
  const saved: Record<PageName, unknown> = {
    home: store.homeLayout,
    category: (store.pageLayouts as Record<string, unknown> | null)?.category,
    product: (store.pageLayouts as Record<string, unknown> | null)?.product,
  };
  const layouts = Object.fromEntries(
    (Object.keys(pageLayoutSchemas) as PageName[]).map((page) => {
      const parsed = pageLayoutSchemas[page].safeParse(saved[page] ?? (page === "home" ? [] : defaultLayouts[page]));
      return [page, parsed.success ? (parsed.data as PageLayout) : page === "home" ? [] : defaultLayouts[page]];
    }),
  ) as Record<PageName, PageLayout>;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <PagesEditor
          layouts={layouts}
          storeUrl={storeUrl(store.slug)}
          billboards={billboards.map((b) => ({ value: b.id, label: b.label }))}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          products={products.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
    </div>
  );
};

export default PagesPage;
