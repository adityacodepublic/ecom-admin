import { format } from "date-fns";

import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

import { ProductsClient } from "./components/client";
import { ProductColumn } from "./components/columns";

const ProductsPage = async ({ params }: { params: { storeId: string } }) => {
  // Fetch all filters for this store
  const filters = await prismadb.filter.findMany({
    where: {
      storeId: params.storeId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const products = await prismadb.product.findMany({
    where: {
      storeId: params.storeId,
    },
    select: {
      id: true,
      name: true,
      price: true,
      quantity: true,
      isFeatured: true,
      isArchived: true,
      createdAt: true,
      category: {
        select: {
          name: true,
        },
      },
      filteritems: {
        select: {
          value: {
            select: {
              value: true,
              unit: true,
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
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedProducts: ProductColumn[] = products.map((item) => {
    // Create a map of filter name to combined value+unit for this product
    const filterValues: Record<string, string> = {};
    item.filteritems.forEach((fi) => {
      const valueStr = fi.value.value ? fi.value.value.toString() + " " : "";
      const unitStr = fi.value.unit || "";
      filterValues[fi.value.filter.name] = (valueStr + unitStr).trim();
    });

    return {
      id: item.id,
      name: item.name,
      isFeatured: item.isFeatured,
      isArchived: item.isArchived,
      price: formatter.format(item.price.toNumber()),
      category: item.category.name,
      quantity: item.quantity,
      createdAt: format(item.createdAt, "d MMM, yyyy"),
      ...filterValues, // Spread filter values as dynamic properties
    };
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductsClient data={formattedProducts} filters={filters} />
      </div>
    </div>
  );
};

export default ProductsPage;
