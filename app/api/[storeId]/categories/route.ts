import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";
import { isPageError, pageBody, readPage } from "@/lib/api/paginate";
import { readBanner } from "@/lib/api/category-banner";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
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

    // banner: optional, the category's billboard images.
    const banner = readBanner(body.banner);
    if (!banner.ok) return new NextResponse(banner.error, { status: 400 });

    const category = await prismadb.category.create({
      data: {
        name,
        imageUrl,
        banner: banner.data ?? [],
        storeId: resolvedParams.storeId,
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORIES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const paging = readPage(new URL(req.url).searchParams);
    if (isPageError(paging)) return new NextResponse(paging.error, { status: 400 });

    const categories = await prismadb.category.findMany({
      ...(paging && { orderBy: { id: "asc" as const }, skip: paging.skip, take: paging.take }),
      where: {
        storeId: resolvedParams.storeId,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        banner: true,
      },
    });

    return NextResponse.json(paging ? pageBody(categories, paging) : categories, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORIES_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
