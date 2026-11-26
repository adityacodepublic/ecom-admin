import { revalidateProduct } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { callerOwnsStore, requireStoreOwnerResponse } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import { categoryInStore, valuesInStore, isStockQuantity, isMaxQuantity } from "@/lib/api/store-refs";
import { checkFilterItems, checkImages, checkPrice, inUseResponse } from "@/lib/api/validate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// What a shopper can see of a product, to tell which storefront pages an edit touches.
const shownSelect = {
  name: true,
  price: true,
  categoryId: true,
  description: true,
  quantity: true,
  maxQuantity: true,
  isFeatured: true,
  isArchived: true,
  images: { orderBy: { order: "asc" as const }, select: { url: true } },
  filteritems: { select: { valueId: true } },
};
type Shown = Prisma.ProductGetPayload<{ select: typeof shownSelect }>;

function diffShown(a: Shown, b: Shown) {
  // In stock <-> out of stock: the card's badge flips, and the cached page must not offer an out-of-stock product.
  const crossedZero = a.quantity <= 0 !== b.quantity <= 0;
  const categoryChanged = a.categoryId !== b.categoryId;
  const listingChanged =
    crossedZero ||
    categoryChanged ||
    a.name !== b.name ||
    String(a.price ?? "") !== String(b.price ?? "") ||
    a.isFeatured !== b.isFeatured ||
    a.isArchived !== b.isArchived ||
    (a.images[0]?.url ?? "") !== (b.images[0]?.url ?? "");
  const detailChanged =
    (a.description ?? "") !== (b.description ?? "") ||
    a.maxQuantity !== b.maxQuantity ||
    a.images.map((i) => i.url).join("|") !== b.images.map((i) => i.url).join("|") ||
    a.filteritems.map((i) => i.valueId).sort().join("|") !== b.filteritems.map((i) => i.valueId).sort().join("|");
  return { listingChanged, detailChanged, categoryIds: categoryChanged ? [a.categoryId, b.categoryId] : [] };
}

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
    const owner = await requireStoreOwnerResponse(resolvedParams.storeId);
    if ("error" in owner) return owner.error;

    if (!resolvedParams.productId) {
      return new NextResponse("Product id is required", { status: 400 });
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


    revalidateProduct(resolvedParams.storeId, resolvedParams.productId, { listingChanged: true, categoryId: product.categoryId });
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
    const owner = await requireStoreOwnerResponse(resolvedParams.storeId);
    if ("error" in owner) return owner.error;

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

    // Money is exact: rupees with at most 2 decimals (the column is Decimal(12,2)); null = "Price on request".
    const checkedPrice = checkPrice(price);
    if (!checkedPrice.ok) {
      return new NextResponse(checkedPrice.error, { status: 400 });
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
    const changes = await prismadb.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE id = ${resolvedParams.productId} AND "storeId" = ${resolvedParams.storeId} FOR UPDATE`;
      if (locked.length === 0) return null;
      // What the storefront shows, before and after (under the row lock, so "before" is exactly what we overwrite).
      const before = await tx.product.findUnique({ where: { id: resolvedParams.productId }, select: shownSelect });
      const product = await tx.product.update({
        where: { id: resolvedParams.productId },
        data: {
          name,
          price: checkedPrice.data,
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
      const after = await tx.product.findUnique({ where: { id: resolvedParams.productId }, select: shownSelect });
      return { product, before, after };
    });
    if (!changes) {
      return new NextResponse("Not found", { status: 404 });
    }
    const { product, before, after } = changes;

    // Expire only what changed. A stock-only edit (10 -> 8) expires nothing: the product page checks the live
    // stock in the browser. Crossing 0 changes the card (out-of-stock badge), so it counts as a listing change.
    const diff = before && after ? diffShown(before, after) : { listingChanged: true, detailChanged: true, categoryIds: [categoryId] };
    if (diff.listingChanged) {
      revalidateProduct(resolvedParams.storeId, resolvedParams.productId, { listingChanged: true, categoryId: product.categoryId, categoryIds: diff.categoryIds });
    } else if (diff.detailChanged) {
      revalidateProduct(resolvedParams.storeId, resolvedParams.productId, { listingChanged: false });
    }
    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
