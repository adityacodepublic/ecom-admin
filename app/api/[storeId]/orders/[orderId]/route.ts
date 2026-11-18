import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { getAdminOrder } from "@/lib/orders/queries";
import { adminOrderUpdateSchema, adminUpdateOrder, parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds: an order write never legitimately takes this long (see lib/orders/update.ts TX_OPTIONS)

type Params = { params: Promise<{ storeId: string; orderId: string }> };

/** Admin: one order with everything (private events included). orderId = uuid or the order number. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId, orderId } = await params;
    await requireStoreOwner(storeId);
    const order = await getAdminOrder(storeId, parseOrderRef(orderId));
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    return json({ order });
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDER_GET");
  }
}

/** Admin: the status update action (status, payment method/status, expected delivery, Notes, comment, page message). */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId, orderId } = await params;
    const adminUserId = await requireStoreOwner(storeId);
    const body = await readBody(req, adminOrderUpdateSchema);
    const { id, changed } = await adminUpdateOrder(storeId, parseOrderRef(orderId), adminUserId, body);
    const order = await getAdminOrder(storeId, { id });
    return json({ changed, order });
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDER_PATCH");
  }
}
