import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";

import { FilterForm } from "./components/filter-form";

const FilterPage = async ({
  params,
}: {
  params: Promise<{ filterId: string; storeId: string }>;
}) => {
  const resolvedParams = await params;
  const filter = await prismadb.filter.findFirst({
    where: {
      id: resolvedParams.filterId,
      storeId: resolvedParams.storeId,
    },
    select: {
      id: true,
      name: true,
      value: {
        select: {
          id: true,
          value: true,
          unit: true,
        },
      },
    },
  });

  // "new" is the create page. Any other id must be a filter of THIS store.
  if (!filter && resolvedParams.filterId !== "new") notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <FilterForm initialData={filter} />
      </div>
    </div>
  );
};

export default FilterPage;
