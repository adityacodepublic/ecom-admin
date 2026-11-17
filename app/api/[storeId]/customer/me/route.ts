import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { getCustomer, profilePatchSchema, upsertProfile } from "@/lib/orders/customer";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): my profile + saved addresses. Light on purpose (the checkout page loads it). */
export async function GET(req: Request) {
  const cors = storeCors(req);
  try {
    const { customerId } = verifyCustomerRequest(req);
    return json(await getCustomer(customerId), { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ME_GET", cors);
  }
}

/** Customer (store server only): create my profile (fname, email, phone) or edit some fields. */
export async function PATCH(req: Request) {
  const cors = storeCors(req);
  try {
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, profilePatchSchema);
    return json({ profile: await upsertProfile(customerId, body) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ME_PATCH", cors);
  }
}
