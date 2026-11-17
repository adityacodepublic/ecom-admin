import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { listAdminOrders, orderListQuerySchema } from "@/lib/orders/queries";

import { OrdersClient } from "./components/client";

const PAGE_SIZE = 20;

const OrdersPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);

  // Filters come from the URL. A bad value is simply ignored.
  const sp = await searchParams;
  const query: Record<string, unknown> = { pageSize: PAGE_SIZE };
  for (const k of ["status", "paymentStatus", "q", "from", "to", "page"]) {
    const v = sp[k];
    if (typeof v !== "string" || v === "") continue;
    if (orderListQuerySchema.safeParse({ [k]: v }).success) query[k] = v;
  }
  const q = orderListQuerySchema.parse(query);
  const list = await listAdminOrders(storeId, q);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <OrdersClient
          list={list}
          filters={{ status: q.status ?? "", paymentStatus: q.paymentStatus ?? "", q: q.q ?? "", from: q.from ?? "", to: q.to ?? "" }}
        />
      </div>
    </div>
  );
};

export default OrdersPage;
