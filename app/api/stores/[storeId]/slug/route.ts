import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { changeStoreSlug } from "@/lib/store-slug";

/** Changes the store's URL name. 400 = not allowed, 409 = taken. The old URL stops working. */
export async function PATCH(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }
    const { storeId } = await params;
    const body = await req.json();

    const result = await changeStoreSlug(storeId, userId, body?.slug);
    if (!result.ok) {
      return NextResponse.json({ field: "slug", error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (error) {
    console.log("[STORE_SLUG_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
