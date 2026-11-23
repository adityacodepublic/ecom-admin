import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { getAdminOrder } from "@/lib/orders/queries";
import { adminQuoteSchema, adminSaveQuote } from "@/lib/orders/quote";
import { parseOrderRef } from "@/lib/orders/update";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds: an order write never legitimately takes this long (see lib/orders/update.ts TX_OPTIONS)

type Params = { params: Promise<{ storeId: string; orderId: string }> };

/** Admin: send (or send again) the prices of a quote: each line's unit price and the extra charges. */
export async function PUT(req: Request, { params }: Params) {
  try {
    const { storeId, orderId } = await params;
    const adminUserId = await requireStoreOwner(storeId);
    const body = await readBody(req, adminQuoteSchema);
    const { id } = await adminSaveQuote(storeId, parseOrderRef(orderId), adminUserId, body);
    return json({ order: await getAdminOrder(storeId, { id }) });
  } catch (error) {
    return errorResponse(error, "ADMIN_ORDER_QUOTE");
  }
}
