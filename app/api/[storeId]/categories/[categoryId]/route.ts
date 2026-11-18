import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { inUseResponse } from "@/lib/api/validate";
import { billboardInStore } from "@/lib/api/store-refs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ categoryId: string; storeId?: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }

    const category = await prismadb.category.findFirst({
      where: {
        id: resolvedParams.categoryId,
        storeId: resolvedParams.storeId,
      },
      select: {
        billboard: {
          select: {
            label: true,
            images: {
              select: {
                url: true,
                href: true,
              },
            },
          },
        },
        id: true,
        name: true,
      },
    });

    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORY_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ categoryId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
      select: { id: true },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.category.findFirst({
      where: { id: resolvedParams.categoryId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    const category = await prismadb.category.delete({
      where: {
        id: resolvedParams.categoryId,
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    const inUse = inUseResponse(error, "Make sure you removed all products using this category first.", corsHeaders);
    if (inUse) return inUse;
    console.log("[CATEGORY_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ categoryId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    const body = await req.json();

    const { name, billboardId, imageUrl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!billboardId) {
      return new NextResponse("Billboard ID is required", { status: 400 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400 });
    }

    if (!resolvedParams.categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
      select: { id: true },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.category.findFirst({
      where: { id: resolvedParams.categoryId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (!(await billboardInStore(resolvedParams.storeId, billboardId))) {
      return new NextResponse("Billboard not found in this store", { status: 400 });
    }

    const category = await prismadb.category.update({
      where: {
        id: resolvedParams.categoryId,
      },
      data: {
        name,
        billboardId,
        imageUrl,
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORY_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
