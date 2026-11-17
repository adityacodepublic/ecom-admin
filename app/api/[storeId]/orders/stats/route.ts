import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { getOrderStats } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

/** Admin: order dashboard numbers. */
export async function GET(_req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    return json(await getOrderStats(storeId));
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDER_STATS_GET");
  }
}
