import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { isPageError, pageBody, readPage } from "@/lib/api/paginate";

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

    const { name, value } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!value) {
      return new NextResponse("Value is required", { status: 400 });
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


    const duplicate = await prismadb.filter.findFirst({
      where: { storeId: resolvedParams.storeId, name },
      select: { id: true },
    });
    if (duplicate) {
      return new NextResponse("A filter with this name already exists", { status: 409 });
    }

    const filter = await prismadb.filter.create({
      data: {
        storeId: resolvedParams.storeId,
        name,
        value: {
          createMany: {
            data: [
              ...value.map(
                (values: { storeId: string; value: Decimal; unit: string }) =>
                  values,
              ),
            ],
          },
        },
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse("A filter with this name already exists", { status: 409 });
    }
    console.log("[FILTERS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const url = new URL(req.url);
    const name = url.searchParams.get("name");

    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    if (name) {
      // Get specific filter by name
      const filter = await prismadb.filter.findFirst({
        where: {
          name: name,
          storeId: resolvedParams.storeId,
        },
        select: {
          id: true,
          name: true,
          value: {
            select: {
              id: true,
              value: true,
              unit: true,
            },
          },
        },
      });
      return NextResponse.json(filter, { headers: corsHeaders });
    }

    const paging = readPage(url.searchParams);
    if (isPageError(paging)) return new NextResponse(paging.error, { status: 400 });

    // Get all filters for the store
    const filters = await prismadb.filter.findMany({
      ...(paging && { orderBy: { id: "asc" as const }, skip: paging.skip, take: paging.take }),
      where: {
        storeId: resolvedParams.storeId,
      },
      select: {
        id: true,
        name: true,
        value: {
          select: {
            id: true,
            value: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(paging ? pageBody(filters, paging) : filters, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
