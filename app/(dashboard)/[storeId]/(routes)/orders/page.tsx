import { Suspense } from "react";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ADMIN_LIST_KEYS, filtersAsText, orderListQuerySchema } from "@/lib/orders/list-query";
import { filterLabels, listAdminOrders } from "@/lib/orders/queries";
import { parseUrlQuery } from "@/lib/url-query";

import { OrdersClient } from "./components/client";

const PAGE_SIZE = 20;

const OrdersPage = async ({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);

  // Filters come from the URL. A bad value is simply ignored.
  const q = { ...parseUrlQuery(orderListQuerySchema, ADMIN_LIST_KEYS, await searchParams), pageSize: PAGE_SIZE };
  // Started, not awaited: OrdersClient reads it with use() inside the <Suspense> below, so the page shell shows at once.
  // When a filter changes, the old rows stay (dimmed) until the new ones arrive (the boundary is not keyed on purpose).
  // The place and product options for the filters are read only when such a filter opens (/orders/facets).
  const data = Promise.all([listAdminOrders(storeId, q), filterLabels(storeId, q)]).then(([list, labels]) => ({ list, ...labels }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Suspense fallback={<TableSkeleton rows={10} />}>
          <OrdersClient data={data} filters={filtersAsText(q)} />
        </Suspense>
      </div>
    </div>
  );
};

export default OrdersPage;
