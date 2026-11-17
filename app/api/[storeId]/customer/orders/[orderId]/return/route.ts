import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { getCustomerOrder } from "@/lib/orders/queries";
import { customerRequestReturn, customerReturnSchema, customerWithdrawReturn, parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";

const METHODS = "POST, DELETE, OPTIONS";
type Params = { params: Promise<{ storeId: string; orderId: string }> };

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req, METHODS) });
}

/** Customer (store server only): ask to return MY whole order (returns on, final stage, inside the window). */
export async function POST(req: Request, { params }: Params) {
  const cors = storeCors(req, METHODS);
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, customerReturnSchema);
    const { id } = await customerRequestReturn(storeId, customerId, parseOrderRef(orderId), body);
    return json({ order: await getCustomerOrder(storeId, customerId, { id }) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_RETURN", cors);
  }
}

/** Customer (store server only): withdraw the return request while it is still at the first return status. */
export async function DELETE(req: Request, { params }: Params) {
  const cors = storeCors(req, METHODS);
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const { id } = await customerWithdrawReturn(storeId, customerId, parseOrderRef(orderId));
    return json({ order: await getCustomerOrder(storeId, customerId, { id }) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_RETURN_WITHDRAW", cors);
  }
}
