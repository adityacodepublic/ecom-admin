import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { addAddress, addressInputSchema } from "@/lib/orders/customer";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): save a new address. */
export async function POST(req: Request) {
  const cors = storeCors(req);
  try {
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, addressInputSchema);
    return json({ address: await addAddress(customerId, body) }, { status: 201, headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ADDRESS_POST", cors);
  }
}
