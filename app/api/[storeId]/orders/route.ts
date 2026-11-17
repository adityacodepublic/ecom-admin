import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { listAdminOrders, parseListQuery } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

/** Admin: list this store's orders. ?status=&paymentStatus=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize= */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const q = parseListQuery(new URL(req.url).searchParams, ["status", "paymentStatus", "from", "to", "page", "pageSize"]);
    return json(await listAdminOrders(storeId, q));
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDERS_GET");
  }
}
