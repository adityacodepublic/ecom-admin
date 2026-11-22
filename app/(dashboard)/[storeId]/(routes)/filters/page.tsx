import { Suspense } from "react";
import { format } from "date-fns";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { TableSkeleton } from "@/components/ui/skeleton";
import prismadb from "@/lib/prismadb";

import { FilterColumn } from "./components/columns";
import { FiltersClient } from "./components/client";

const FiltersPage = async ({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) => {
  const resolvedParams = await params;
  await requireStoreOwnerPage(resolvedParams.storeId);
  // Owner check first, then the read is started and not awaited: the client reads it with use() inside <Suspense>,
  // so the page shell (navigation, layout) shows at once and the table fills in when the rows arrive.
  const data = loadFilters(resolvedParams.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Suspense fallback={<TableSkeleton />}>
          <FiltersClient data={data} />
        </Suspense>
      </div>
    </div>
  );
};

async function loadFilters(storeId: string): Promise<FilterColumn[]> {
  const filters = await prismadb.filter.findMany({
    where: {
      storeId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      value: {
        select: {
          value: true,
          unit: true,
        },
      },
    },
  });

  return filters.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.value.map(
      (values) => (values.value ?? "") + " " + (values.unit ?? ""),
    ),
    createdAt: format(item.updatedAt, "MMMM do, yyyy"),
  }));
}

export default FiltersPage;
