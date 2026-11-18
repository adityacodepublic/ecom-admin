import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import { categoryInStore, valuesInStore, isStockQuantity, isMaxQuantity } from "@/lib/api/store-refs";
import { callerOwnsStore, checkFilterItems, checkImages, inUseResponse } from "@/lib/api/validate";

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

    // Archived products never appear in a public request: for anyone but the store owner they read as missing.
    const owner = await callerOwnsStore(resolvedParams.storeId);
    const product = await prismadb.product.findFirst({
      where: {
        id: resolvedParams.productId,
        storeId: resolvedParams.storeId,
        ...(owner ? {} : { isArchived: false }),
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
    const userId = await getUserId();

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
      select: { id: true },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.product.findFirst({
      where: { id: resolvedParams.productId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    const product = await prismadb.product.delete({
      where: {
        id: resolvedParams.productId,
      },
    });


    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    const inUse = inUseResponse(error, "This product is in an order. Archive it instead of deleting it.", corsHeaders);
    if (inUse) return inUse;
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
    const userId = await getUserId();

    const body = await req.json();

    const {
      name,
      price,
      categoryId,
      images,
      quantity,
      loadedQuantity,
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

    const checkedImages = checkImages(images);
    if (!checkedImages.ok) {
      return new NextResponse(checkedImages.error, { status: 400 });
    }

    const checkedItems = checkFilterItems(filteritems);
    if (!checkedItems.ok) {
      return new NextResponse(checkedItems.error, { status: 400 });
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

    if (quantity === undefined || quantity === null || quantity === "") {
      return new NextResponse("Quantity is required", { status: 400 });
    }

    if (!isStockQuantity(quantity)) {
      return new NextResponse("Quantity must be a whole number, 0 or more", { status: 400 });
    }

    // The admin form sends the stock it loaded. Only an actual edit (quantity differs) writes stock, so saving
    // a name change cannot overwrite sales that happened since the page opened. Absent = API client: write as given.
    if (loadedQuantity !== undefined && loadedQuantity !== null && !isStockQuantity(loadedQuantity)) {
      return new NextResponse("loadedQuantity must be a whole number, 0 or more", { status: 400 });
    }
    const writeQuantity = loadedQuantity === undefined || loadedQuantity === null || quantity !== loadedQuantity;

    if (maxQuantity === undefined || maxQuantity === null || maxQuantity === "") {
      return new NextResponse("Max Quantity is required", { status: 400 });
    }

    if (!isMaxQuantity(maxQuantity)) {
      return new NextResponse("Max Quantity must be a whole number, 1 or more", { status: 400 });
    }

    if (!categoryId) {
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
    const inStore = await prismadb.product.findFirst({
      where: { id: resolvedParams.productId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (!(await categoryInStore(resolvedParams.storeId, categoryId))) {
      return new NextResponse("Category not found in this store", { status: 400 });
    }

    if (!(await valuesInStore(resolvedParams.storeId, checkedItems.data))) {
      return new NextResponse("Filter value not found in this store", { status: 400 });
    }

    // One transaction: fields, images and filter items change together or not at all. The row lock makes
    // concurrent edits of the same product take turns (no duplicated images).
    const product = await prismadb.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE id = ${resolvedParams.productId} AND "storeId" = ${resolvedParams.storeId} FOR UPDATE`;
      if (locked.length === 0) return null;
      return tx.product.update({
        where: { id: resolvedParams.productId },
        data: {
          name,
          price,
          categoryId,
          description,
          ...(writeQuantity ? { quantity } : {}),
          maxQuantity,
          isFeatured,
          isArchived,
          images: {
            deleteMany: {},
            createMany: {
              data: checkedImages.data.map((image) => ({ url: image.url, order: image.order })),
            },
          },
          filteritems: {
            deleteMany: {},
            ...(checkedItems.data.length > 0
              ? { createMany: { data: checkedItems.data.map((valueId) => ({ valueId })) } }
              : {}),
          },
        },
      });
    });
    if (!product) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
