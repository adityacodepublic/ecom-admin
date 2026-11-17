import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";

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
  { params }: { params: Promise<{ productId: string; storeId?: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    const product = await prismadb.product.findUnique({
      where: {
        id: resolvedParams.productId,
      },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        maxQuantity: true,
        description: true,
        images: {
          orderBy: {
            order: "asc",
          },
          select: {
            url: true,
            order: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        filteritems: {
          select: {
            value: {
              select: {
                value: true,
                unit: true,
                filter: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ productId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    const product = await prismadb.product.delete({
      where: {
        id: resolvedParams.productId,
      },
    });


    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ productId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();

    const body = await req.json();

    const {
      name,
      price,
      categoryId,
      images,
      quantity,
      maxQuantity,
      isFeatured,
      isArchived,
      filteritems,
      description,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!images || !images.length) {
      return new NextResponse("Images are required", { status: 400 });
    }

    if (!price) {
      return new NextResponse("Price is required", { status: 400 });
    }

    // Money is exact: rupees with at most 2 decimals (the column is Decimal(12,2)).
    try {
      if (toPaise(price) <= 0) throw new Error();
    } catch {
      return new NextResponse("Price must be a positive amount with at most 2 decimals", { status: 400 });
    }

    if (!quantity) {
      return new NextResponse("Quantity is required", { status: 400 });
    }

    if (!maxQuantity) {
      return new NextResponse("Max Quantity is required", { status: 400 });
    }

    if (!categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    await prismadb.product.update({
      where: {
        id: resolvedParams.productId,
      },
      data: {
        name,
        price,
        categoryId,
        description,
        quantity,
        maxQuantity,
        images: {
          deleteMany: {},
        },
        filteritems: {
          deleteMany: {},
        },
        isFeatured,
        isArchived,
      },
    });

    const product = await prismadb.product.update({
      where: {
        id: resolvedParams.productId,
      },
      data: {
        images: {
          createMany: {
            data: [
              ...images.map((image: { url: string; order: number }) => ({
                url: image.url,
                order: image.order,
              })),
            ],
          },
        },
        filteritems:
          filteritems && filteritems.length > 0
            ? {
                createMany: {
                  data: filteritems.map(
                    (item: { filterId: string; valueId: string }) => ({
                      valueId: item.valueId,
                    }),
                  ),
                },
              }
            : undefined,
      },
    });


    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
