import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { OrderError } from "@/lib/orders/errors";
import { getCustomerOrder } from "@/lib/orders/queries";
import { customerEditOrder, customerEditSchema, parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds: an order write never legitimately takes this long (see lib/orders/update.ts TX_OPTIONS)

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req, "GET, PATCH, OPTIONS") });
}

/** Customer (store server only): one of MY orders. orderId = uuid or order number. Customer-visible data only. */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string; orderId: string }> }) {
  const cors = storeCors(req, "GET, PATCH, OPTIONS");
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const order = await getCustomerOrder(storeId, customerId, parseOrderRef(orderId));
    if (!order) throw new OrderError("NOT_FOUND", "Order not found");
    return json({ order }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_GET", cors);
  }
}

/** Customer (store server only): change the note or the delivery instructions of MY order, at any time. */
export async function PATCH(req: Request, { params }: { params: Promise<{ storeId: string; orderId: string }> }) {
  const cors = storeCors(req, "GET, PATCH, OPTIONS");
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, customerEditSchema);
    const { id } = await customerEditOrder(storeId, customerId, parseOrderRef(orderId), body);
    return json({ order: await getCustomerOrder(storeId, customerId, { id }) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_EDIT", cors);
  }
}
