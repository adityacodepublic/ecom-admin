import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { getOrderFacets } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

/**
 * Admin: what the place and product filters offer (the places the store's orders went to, the products ordered).
 * Read when a filter that needs it opens, not with every list page. The browser may keep it for 8 minutes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    return json(await getOrderFacets(storeId), { headers: { "Cache-Control": "private, max-age=480" } });
  } catch (error) {
    return errorResponse(error, "ORDER_FACETS_GET");
  }
}
