import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { getCustomerOrder } from "@/lib/orders/queries";
import { customerCancelOrder, customerCancelSchema, parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): cancel MY order (when the store allows it at its current status). Stock is not changed (the admin restores it). */
export async function POST(req: Request, { params }: { params: Promise<{ storeId: string; orderId: string }> }) {
  const cors = storeCors(req);
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const { reason } = await readBody(req, customerCancelSchema);
    const { id } = await customerCancelOrder(storeId, customerId, parseOrderRef(orderId), reason);
    return json({ order: await getCustomerOrder(storeId, customerId, { id }) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_CANCEL", cors);
  }
}
