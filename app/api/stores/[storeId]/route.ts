import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { inUseResponse } from "@/lib/api/validate";
export const revalidate = 0;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    const body = await req.json();

    // The name only. The slug (store URL name) changes through PATCH /api/stores/[storeId]/slug.
    const { name } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    const resolvedParams = await params;
    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const store = await prismadb.store.update({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
      data: {
        name,
      },
    });

    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<NextResponse> {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    // Library rows first, then the store, in ONE transaction: if the store delete fails
    // (it still has products etc.) the library rows come back. Cloudinary files stay.
    // Only this user's own store is touched.
    const [, store] = await prismadb.$transaction([
      prismadb.mediaImage.deleteMany({
        where: { storeId: resolvedParams.storeId, store: { userId } },
      }),
      prismadb.store.deleteMany({
        where: {
          id: resolvedParams.storeId,
          userId,
        },
      }),
    ]);

    return NextResponse.json(store);
  } catch (error) {
    const inUse = inUseResponse(
      error,
      "The store was not deleted. Remove its products, categories, billboards, filters, customers and orders first.",
    );
    if (inUse) return inUse;
    console.log("[STORE_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
