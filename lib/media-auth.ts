import { NextResponse } from "next/server";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";

/**
 * @deprecated Use `requireStoreOwnerResponse` from `@/lib/api/admin-auth` directly.
 * Every media/users route checks that the caller is signed in and owns the store.
 * Returns an error response (401/403), or null if fine.
 */
export async function checkStoreOwner(storeId: string): Promise<NextResponse | null> {
  const owner = await requireStoreOwnerResponse(storeId);
  return "error" in owner ? owner.error : null;
}
