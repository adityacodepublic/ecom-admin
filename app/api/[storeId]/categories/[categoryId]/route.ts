import { revalidateCategory, revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";
import { inUseResponse } from "@/lib/api/validate";
import { readBanner } from "@/lib/api/category-banner";

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
      select: { id: true, name: true, imageUrl: true, banner: true },
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
    const owner = await requireStoreOwnerResponse(resolvedParams.storeId);
    if ("error" in owner) return owner.error;

    if (!resolvedParams.categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
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
    const owner = await requireStoreOwnerResponse(resolvedParams.storeId);
    if ("error" in owner) return owner.error;

    const body = await req.json();

    const { name, imageUrl } = body;

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!imageUrl) {
      return new NextResponse("Thumbnail (imageUrl) is required", { status: 400 });
    }

    // banner: optional; left out = unchanged.
    const banner = readBanner(body.banner);
    if (!banner.ok) return new NextResponse(banner.error, { status: 400 });

    if (!resolvedParams.categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.category.findFirst({
      where: { id: resolvedParams.categoryId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    const category = await prismadb.category.update({
      where: {
        id: resolvedParams.categoryId,
      },
      data: {
        name,
        imageUrl,
        ...(banner.data && { banner: banner.data }),
      },
    });


    revalidateCategory(resolvedParams.storeId, resolvedParams.categoryId);
    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORY_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
