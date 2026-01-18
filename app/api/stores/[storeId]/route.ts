import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { revalidateTag } from "next/cache";
import { deleteStore, patchUrl } from "@/lib/_allowedDomains/domains";
export const revalidate = 0;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    const body = await req.json();

    const { name, url } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!url) {
      return new NextResponse("URL is required", { status: 400 });
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
        url,
      },
    });

    patchUrl(resolvedParams.storeId, url);
    try {
      revalidateTag("storeurl", "max");
      revalidateTag("store_url", "max");
    } catch (error) {
      console.error("Error processing revalidation:", error);
    }
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

    const store = await prismadb.store.deleteMany({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    deleteStore(resolvedParams.storeId);
    try {
      revalidateTag("storeurl", "max");
      revalidateTag("store_url", "max");
    } catch (error) {
      console.error("Error processing revalidation:", error);
    }

    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
