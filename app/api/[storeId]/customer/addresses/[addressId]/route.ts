import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { verifyCustomerRequest } from "@/lib/api/store-auth";
import { addressPatchSchema, deleteAddress, updateAddress } from "@/lib/orders/customer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string; addressId: string }> };

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req) });
}

/** Customer (store server only): edit one of MY addresses (old orders keep their frozen copy). */
export async function PATCH(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { addressId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    const body = await readBody(req, addressPatchSchema);
    return json({ address: await updateAddress(customerId, addressId, body) }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ADDRESS_PATCH", cors);
  }
}

/** Customer (store server only): remove one of MY addresses, only if no order uses it. */
export async function DELETE(req: Request, { params }: Params) {
  const cors = storeCors(req);
  try {
    const { addressId } = await params;
    const { customerId } = verifyCustomerRequest(req);
    await deleteAddress(customerId, addressId);
    return json({ deleted: true }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "CUSTOMER_ADDRESS_DELETE", cors);
  }
}
