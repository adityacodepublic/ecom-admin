import prismadb from "@/lib/prismadb";

import { ProductForm } from "./components/product-form";

const ProductPage = async ({
  params,
}: {
  params: Promise<{ productId: string; storeId: string }>;
}) => {
  const resolvedParams = await params;
  const product = await prismadb.product.findUnique({
    where: {
      id: resolvedParams.productId,
    },
    include: {
      images: true,
      filteritems: {
        select: {
          valueId: true,
          value: {
            select: {
              value: true,
              unit: true,
              filterId: true,
              filter: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const categories = await prismadb.category.findMany({
    where: {
      storeId: resolvedParams.storeId,
    },
  });

  const filters = await prismadb.filter.findMany({
    where: {
      storeId: resolvedParams.storeId,
    },
    include: {
      value: {
        select: {
          id: true,
          value: true,
          unit: true,
        },
      },
    },
  });

  // Convert Decimal to string for form compatibility
  const convertedFilters = filters.map((filter) => ({
    id: filter.id,
    name: filter.name,
    value: filter.value.map((v) => ({
      id: v.id,
      value: v.value?.toString() || null,
      unit: v.unit,
    })),
  }));

  // Convert Decimal in product filteritems
  const convertedProduct = product
    ? {
        ...product,
        filteritems: product.filteritems?.map((item) => ({
          valueId: item.valueId,
          value: {
            ...item.value,
            value: item.value.value?.toString() || null,
          },
        })),
      }
    : null;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductForm
          categories={categories}
          initialData={convertedProduct}
          filters={convertedFilters}
        />
      </div>
    </div>
  );
};

export default ProductPage;
