import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { cartChangesSchema, getCart, saveCartChanges } from "@/lib/cart";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): my saved cart in this store. */
export async function GET(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { storeId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    return json(await getCart(storeId, customerId), { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_CART_GET", cors);
  }
}

/** Customer (store server only): save what changed ({ changes: [{ productId, quantity }], merge? }), get the whole cart back. */
export async function PATCH(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { storeId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, cartChangesSchema);
    return json(await saveCartChanges(storeId, customerId, body), { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_CART_PATCH", cors);
  }
}
