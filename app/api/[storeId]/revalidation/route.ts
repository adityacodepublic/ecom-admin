import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { parseRevalidationHealth } from "@/lib/store-revalidate";
import { readSettings } from "@/lib/store-settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/** Owner: check whether storefront cache revalidation is healthy and inspect recent failures. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const settings = await readSettings(storeId);
    if (settings === null) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    return json({ health: parseRevalidationHealth(settings) });
  } catch (error) {
    return errorResponse(error, "REVALIDATION_HEALTH_GET");
  }
}
