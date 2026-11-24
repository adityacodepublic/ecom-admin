import { NextResponse } from "next/server";

import { signUpload } from "@/lib/cloudinary";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";

// Gives the browser a signed upload for THIS store's folder. The secret stays here.
export async function POST(_req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    return NextResponse.json(signUpload(storeId));
  } catch (error) {
    console.log("[MEDIA_SIGN]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
