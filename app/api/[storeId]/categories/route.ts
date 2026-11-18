import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { isPageError, pageBody, readPage } from "@/lib/api/paginate";
import { billboardInStore } from "@/lib/api/store-refs";

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
    const userId = await getUserId();

    const body = await req.json();

    const { name, billboardId, imageUrl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!billboardId) {
      return new NextResponse("Billboard ID is required", { status: 400 });
    }

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400 });
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
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

    if (!(await billboardInStore(resolvedParams.storeId, billboardId))) {
      return new NextResponse("Billboard not found in this store", { status: 400 });
    }

    const category = await prismadb.category.create({
      data: {
        name,
        billboardId,
        imageUrl,
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
      },
    });

    return NextResponse.json(paging ? pageBody(categories, paging) : categories, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORIES_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
