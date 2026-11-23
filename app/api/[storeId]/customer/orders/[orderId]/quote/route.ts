import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { getCustomerOrder } from "@/lib/orders/queries";
import { customerDecideQuote, customerQuoteSchema } from "@/lib/orders/quote";
import { parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds: an order write never legitimately takes this long (see lib/orders/update.ts TX_OPTIONS)

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): accept or decline the prices of MY quote. Accepting takes the stock and places the order. */
export async function POST(req: Request, { params }: { params: Promise<{ storeId: string; orderId: string }> }) {
  const cors = storeCors(req);
  try {
    const { storeId, orderId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, customerQuoteSchema);
    const { id } = await customerDecideQuote(storeId, customerId, parseOrderRef(orderId), body);
    return json({ order: await getCustomerOrder(storeId, customerId, { id }) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ORDER_QUOTE", cors);
  }
}
