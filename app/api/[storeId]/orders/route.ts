import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { ADMIN_LIST_KEYS, listAdminOrders, parseListQuery } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

/** Admin: list this store's orders. ?q=&status=&paymentStatus=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize= and the other ADMIN_LIST_KEYS filters (q: order number, customer or receiver name/email/phone) */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const q = parseListQuery(new URL(req.url).searchParams, [...ADMIN_LIST_KEYS, "pageSize"]);
    return json(await listAdminOrders(storeId, q));
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDERS_GET");
  }
}
