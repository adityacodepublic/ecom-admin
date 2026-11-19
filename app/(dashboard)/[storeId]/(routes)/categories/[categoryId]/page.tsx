import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";

import { CategoryForm } from "./components/category-form";

const CategoryPage = async ({
  params,
}: {
  params: Promise<{ categoryId: string; storeId: string }>;
}) => {
  const resolvedParams = await params;
  const category = await prismadb.category.findFirst({
    where: {
      id: resolvedParams.categoryId,
      storeId: resolvedParams.storeId,
    },
  });

  // "new" is the create page. Any other id must be a category of THIS store.
  if (!category && resolvedParams.categoryId !== "new") notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CategoryForm initialData={category} />
      </div>
    </div>
  );
};

export default CategoryPage;
