import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody, storeCors } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { getPublicOrderSettings, orderSettingsPatchSchema, updateOrderSettings } from "@/lib/orders/settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: storeCors(req, "GET, OPTIONS") });
}

/** Public: the safe part of the order settings (checkout payment step on/off) plus the store contact phone/WhatsApp. */
export async function GET(req: Request, { params }: Params) {
  const cors = storeCors(req, "GET, OPTIONS");
  try {
    const { storeId } = await params;
    const settings = await getPublicOrderSettings(storeId);
    if (!settings) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    return json({ settings }, { headers: cors });
  } catch (error) {
    return errorResponse(error, "ORDER_SETTINGS_GET", cors);
  }
}

/** Owner: change some settings. Returns the full settings. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, orderSettingsPatchSchema);
    const settings = await updateOrderSettings(storeId, body);
    if (!settings) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    return json({ settings });
  } catch (error) {
    return errorResponse(error, "ORDER_SETTINGS_PATCH");
  }
}
