import { Suspense } from "react";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { TableSkeleton } from "@/components/ui/skeleton";
import { parseCustomerQuery } from "@/lib/customer-query";
import { CUSTOMER_PAGE_SIZE, listStoreCustomers } from "@/lib/customers";
import { getOrderFacets } from "@/lib/orders/queries";
import { parseClarityProjectId, readSettings } from "@/lib/store-settings";

import { UserClient } from "./components/client";

/** The store's customers, 50 a page (?page=N), searched (?q=) and filtered (column titles) on the server over all of them. */
const UsersPage = async ({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);
  const query = parseCustomerQuery(await searchParams);
  // Started, not awaited: UserClient reads it with use() inside the <Suspense> below. When a filter changes, the
  // rows on screen stay until the new ones arrive (the boundary is not keyed on purpose).
  const data = Promise.all([listStoreCustomers(storeId, query), getOrderFacets(storeId), readSettings(storeId)]).then(([list, facets, settings]) => ({
    ...list,
    facets,
    clarityProjectId: parseClarityProjectId(settings) ?? "",
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Suspense fallback={<TableSkeleton />}>
          <UserClient data={data} query={query} pageSize={CUSTOMER_PAGE_SIZE} />
        </Suspense>
      </div>
    </div>
  );
};

export default UsersPage;
