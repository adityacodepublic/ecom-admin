import { format } from "date-fns";

import prismadb from "@/lib/prismadb";

import { FilterColumn } from "./components/columns";
import { FiltersClient } from "./components/client";

const FiltersPage = async ({ params }: { params: { storeId: string } }) => {
  const filters = await prismadb.filter.findMany({
    where: {
      storeId: params.storeId,
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

  const formattedFilters: FilterColumn[] = filters.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.value.map(
      (values) => (values.value ?? "") + " " + (values.unit ?? "")
    ),
    createdAt: format(item.updatedAt, "MMMM do, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <FiltersClient data={formattedFilters} />
      </div>
    </div>
  );
};

export default FiltersPage;
