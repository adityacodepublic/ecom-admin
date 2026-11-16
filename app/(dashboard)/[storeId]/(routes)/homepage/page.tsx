import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { homeLayoutSchema } from "@/lib/home-layout";
import { storeUrl } from "@/lib/store-url";
import { HomeLayoutEditor } from "./components/home-layout-editor";

const HomePageLayoutPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const [store, billboards, categories] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, homeLayout: true } }),
    prismadb.billboard.findMany({ where: { storeId }, select: { id: true, label: true }, orderBy: { label: "asc" } }),
    prismadb.category.findMany({ where: { storeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!store) notFound();

  // A layout that no longer matches the schema starts empty instead of breaking the page.
  const layout = homeLayoutSchema.safeParse(store.homeLayout ?? []);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <HomeLayoutEditor
          initialLayout={layout.success ? layout.data : []}
          storeUrl={storeUrl(store.slug)}
          billboards={billboards.map((b) => ({ value: b.id, label: b.label }))}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    </div>
  );
};

export default HomePageLayoutPage;
