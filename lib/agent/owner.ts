import { requireStoreOwner } from "@/lib/api/admin-auth";
import { isOrderError } from "@/lib/orders/errors";
import { fail } from "@/lib/agent/proxy";

/** Owner-route guard (Clerk session). Returns the owner id, or an error response. */
export async function ownerOrError(storeId: string): Promise<{ userId: string } | { error: Response }> {
  try {
    return { userId: await requireStoreOwner(storeId) };
  } catch (e) {
    if (isOrderError(e)) return { error: fail(e.status, e.message) };
    throw e;
  }
}
