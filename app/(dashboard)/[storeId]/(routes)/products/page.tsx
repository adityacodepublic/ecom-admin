import { Suspense } from "react";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { TableSkeleton } from "@/components/ui/skeleton";
import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

import { ProductsClient } from "./components/client";
import { ProductColumn } from "./components/columns";

const ProductsPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const resolvedParams = await params;
  await requireStoreOwnerPage(resolvedParams.storeId);
  // Owner check first, then the read is started and not awaited: the client reads it with use() inside <Suspense>,
  // so the page shell (navigation, layout) shows at once and the table fills in when the rows arrive.
  const data = loadProducts(resolvedParams.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Suspense fallback={<TableSkeleton />}>
          <ProductsClient data={data} />
        </Suspense>
      </div>
    </div>
  );
};

async function loadProducts(storeId: string) {
  // The store's filters (a column each) and its products, read together.
  const [filters, products] = await Promise.all([
    prismadb.filter.findMany({
      where: { storeId },
      select: { id: true, name: true },
    }),
    prismadb.product.findMany({
      where: {
        storeId,
      },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        isFeatured: true,
        isArchived: true,
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
    }),
  ]);

  const formattedProducts: ProductColumn[] = products.map((item) => {
    // This product's value of each store filter (value + unit, e.g. "8 GB"), by filter id.
    const filterValues: Record<string, string> = {};
    for (const fi of item.filteritems) filterValues[fi.value.filter.id] = `${fi.value.value ?? ""} ${fi.value.unit ?? ""}`.trim();

    return {
      id: item.id,
      name: item.name,
      isFeatured: item.isFeatured,
      isArchived: item.isArchived,
      price: item.price === null ? "On request" : formatter.format(item.price.toNumber()),
      priceRupees: item.price === null ? null : item.price.toNumber(),
      category: item.category.name,
      quantity: item.quantity,
      filterValues,
    };
  });

  return { rows: formattedProducts, filters };
}

export default ProductsPage;
