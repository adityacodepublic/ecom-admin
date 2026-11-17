import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { checkoutSchema, createOrder } from "@/lib/orders/create";
import { listCustomerOrders, parseListQuery } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): my orders in this store. ?status=&paymentStatus=&page=&pageSize= */
export async function GET(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { storeId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const q = parseListQuery(new URL(req.url).searchParams, ["status", "paymentStatus", "page", "pageSize"]);
    return json(await listCustomerOrders(storeId, customerId, q), { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDERS_GET", cors);
  }
}

/** Customer (store server only): place an order (the checkout). */
export async function POST(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { storeId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, checkoutSchema);
    const order = await createOrder(storeId, customerId, body);
    return json({ order }, { status: 201, headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_CHECKOUT_POST", cors);
  }
}
