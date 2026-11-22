import { Suspense } from "react";
import { format } from "date-fns";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { TableSkeleton } from "@/components/ui/skeleton";
import prismadb from "@/lib/prismadb";

import { CategoryColumn } from "./components/columns";
import { CategoriesClient } from "./components/client";

const CategoriesPage = async ({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) => {
  const resolvedParams = await params;
  await requireStoreOwnerPage(resolvedParams.storeId);
  // Owner check first, then the read is started and not awaited: the client reads it with use() inside <Suspense>,
  // so the page shell (navigation, layout) shows at once and the table fills in when the rows arrive.
  const data = loadCategories(resolvedParams.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Suspense fallback={<TableSkeleton />}>
          <CategoriesClient data={data} />
        </Suspense>
      </div>
    </div>
  );
};

async function loadCategories(storeId: string): Promise<CategoryColumn[]> {
  const categories = await prismadb.category.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return categories.map((item) => ({
    id: item.id,
    name: item.name,
    bannerImages: Array.isArray(item.banner) ? item.banner.length : 0,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }));
}

export default CategoriesPage;
