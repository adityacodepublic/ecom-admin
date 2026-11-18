import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { isPageError, pageBody, readPage } from "@/lib/api/paginate";
import { checkImages } from "@/lib/api/validate";

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

    const { label, images } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!label) {
      return new NextResponse("Label is required", { status: 400 });
    }

    const checkedImages = checkImages(images, { href: true });
    if (!checkedImages.ok) {
      return new NextResponse(checkedImages.error, { status: 400 });
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

    const billboard = await prismadb.billboard.create({
      data: {
        label,
        storeId: resolvedParams.storeId,
        images: {
          createMany: {
            data: checkedImages.data.map((image) => ({
              url: image.url,
              order: image.order,
              href: image.href ?? "",
            })),
          },
        },
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(billboard, { headers: corsHeaders });
  } catch (error) {
    console.log("[BILLBOARDS_POST]", error);
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

    const billboards = await prismadb.billboard.findMany({
      ...(paging && { orderBy: { id: "asc" as const }, skip: paging.skip, take: paging.take }),
      where: {
        storeId: resolvedParams.storeId,
      },
      select: {
        id: true, // the store looks billboards up by id (home layout carousels)
        label: true,
        images: {
          select: {
            url: true,
            order: true,
            href: true,
          },
        },
      },
    });

    return NextResponse.json(paging ? pageBody(billboards, paging) : billboards, { headers: corsHeaders });
  } catch (error) {
    console.log("[BILLBOARDS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
