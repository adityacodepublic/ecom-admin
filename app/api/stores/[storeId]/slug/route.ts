import { NextResponse } from "next/server";

import { requireSessionStoreOwnerResponse } from "@/lib/api/admin-auth";
import { changeStoreSlug } from "@/lib/store-slug";

/** Changes the store's URL name. 400 = not allowed, 409 = taken. The old URL stops working. */
export async function PATCH(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const owner = await requireSessionStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    const body = await req.json();

    const result = await changeStoreSlug(storeId, owner.userId, body?.slug);
    if (!result.ok) {
      return NextResponse.json({ field: "slug", error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (error) {
    console.log("[STORE_SLUG_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
