import { NextResponse } from "next/server";

import { requireSessionStoreOwnerResponse } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";
import { inUseResponse } from "@/lib/api/validate";
import { revalidateStoreInfo } from "@/lib/store-revalidate";
import { removeDomainFromVercelLater, triggerStorefrontRedeploy } from "@/lib/vercel-domains";
export const revalidate = 0;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<NextResponse> {
  try {
    const resolvedParams = await params;
    const owner = await requireSessionStoreOwnerResponse(resolvedParams.storeId);
    if ("error" in owner) return owner.error;
    const { userId } = owner;

    // The slug is needed after the delete, to expire the store app's slug -> store lookup.
    const existing = await prismadb.store.findFirst({
      where: { id: resolvedParams.storeId, userId },
      select: { slug: true, customDomain: true, customDomainVerified: true },
    });

    // Library rows first, then the store, in ONE transaction: if the store delete fails
    // (it still has products etc.) the library rows come back. Cloudinary files stay.
    // Only this user's own store is touched.
    const [, , store] = await prismadb.$transaction([
      prismadb.mediaImage.deleteMany({
        where: { storeId: resolvedParams.storeId, store: { userId } },
      }),
      // Saved carts have no relation to the store: removed here, only when the store is this user's.
      prismadb.$executeRaw`DELETE FROM "CartItem" WHERE "storeId" = ${resolvedParams.storeId} AND EXISTS (SELECT 1 FROM "Store" WHERE "id" = ${resolvedParams.storeId} AND "userId" = ${userId})`,
      prismadb.store.deleteMany({
        where: {
          id: resolvedParams.storeId,
          userId,
        },
      }),
    ]);

    if (existing && store.count > 0) {
      revalidateStoreInfo(existing.slug);
      // Free the hostname on the storefront's Vercel project; a verified one is also dropped from the storefront's build-time map.
      if (existing.customDomain) {
        removeDomainFromVercelLater(existing.customDomain);
        if (existing.customDomainVerified) triggerStorefrontRedeploy(`store ${resolvedParams.storeId} with a custom domain deleted`);
      }
    }

    return NextResponse.json(store);
  } catch (error) {
    const inUse = inUseResponse(
      error,
      "The store was not deleted. Remove its products, categories, filters, customers and orders first.",
    );
    if (inUse) return inUse;
    console.log("[STORE_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
