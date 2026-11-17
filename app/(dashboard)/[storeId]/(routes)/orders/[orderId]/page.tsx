import { notFound } from "next/navigation";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { getAdminOrder } from "@/lib/orders/queries";
import { parseOrderRef } from "@/lib/orders/update";

import { OrderView } from "./components/order-view";

const OrderPage = async ({ params }: { params: Promise<{ storeId: string; orderId: string }> }) => {
  const { storeId, orderId } = await params;
  await requireStoreOwnerPage(storeId);
  const order = await getAdminOrder(storeId, parseOrderRef(decodeURIComponent(orderId)));
  if (!order) notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <OrderView order={order} />
      </div>
    </div>
  );
};

export default OrderPage;
