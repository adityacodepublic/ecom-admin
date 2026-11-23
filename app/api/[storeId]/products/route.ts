import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";
import { categoryInStore, valuesInStore, isStockQuantity, isMaxQuantity } from "@/lib/api/store-refs";
import { isPageError, pageBody, readPage } from "@/lib/api/paginate";
import { callerOwnsStore,checkFilterItems, checkImages, checkPrice } from "@/lib/api/validate";

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

    const {
      name,
      price,
      quantity,
      maxQuantity,
      categoryId,
      images,
      isFeatured,
      isArchived,
      filteritems,
      description,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
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

    if (maxQuantity === undefined || maxQuantity === null || maxQuantity === "") {
      return new NextResponse("Max Quantity is required", { status: 400 });
    }

    if (!isMaxQuantity(maxQuantity)) {
      return new NextResponse("Max Quantity must be a whole number, 1 or more", { status: 400 });
    }

    if (!categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
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

    if (!(await categoryInStore(resolvedParams.storeId, categoryId))) {
      return new NextResponse("Category not found in this store", { status: 400 });
    }

    if (!(await valuesInStore(resolvedParams.storeId, checkedItems.data))) {
      return new NextResponse("Filter value not found in this store", { status: 400 });
    }

    const product = await prismadb.product.create({
      data: {
        name,
        price: checkedPrice.data,
        isFeatured,
        isArchived,
        categoryId,
        description,
        storeId: resolvedParams.storeId,
        quantity,
        maxQuantity,
        images: {
          createMany: {
            data: checkedImages.data.map((image, index) => ({
              url: image.url,
              order: image.order ?? index + 1,
            })),
          },
        },
        filteritems:
          checkedItems.data.length > 0
            ? { createMany: { data: checkedItems.data.map((valueId) => ({ valueId })) } }
            : undefined,
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCTS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const searchValue = searchParams.get("searchValue") || undefined;
    const isFeatured = searchParams.get("isFeatured") || undefined;
    const isArchived = searchParams.get("isArchived") || undefined;
    const price = Number(searchParams.get("price")) || undefined;

    const filters: string[][] = searchParams.get("filterId")
      ? JSON.parse(searchParams.get("filterId")!)
      : [];
    // console.log("Filters:", searchParams.entries());

    const filterConditions = Object.values(filters).map((valueIds) => ({
      filteritems: {
        some: {
          valueId: {
            in: valueIds,
          },
        },
      },
    }));

    const priceFilter: { gt?: number; lt?: number } = {};
    if (price && price > 0) {
      priceFilter.gt = price;
    } else if (price && price < 0) {
      priceFilter.lt = -1 * price;
    }

    let searchWords;
    if (searchValue) {
      const searchWords = searchValue.split(" ");
      searchWords.push(searchValue);
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("StoreId is required", { status: 400 });
    }

    // Archived products never appear in a public request: only the store owner (admin UI, agent) may see
    // them or filter on isArchived. Everyone else always gets isArchived = false, whatever the query says.
    const owner = await callerOwnsStore(resolvedParams.storeId);

    const paging = readPage(searchParams);
    if (isPageError(paging)) return new NextResponse(paging.error, { status: 400 });

    const products = await prismadb.product.findMany({
      ...(paging && { orderBy: { id: "asc" as const }, skip: paging.skip, take: paging.take }),
      where: {
        storeId: resolvedParams.storeId,
        categoryId,
        name: {
          contains: searchValue,
          mode: "insensitive", // Postgres LIKE is case-sensitive, MySQL's was not
        },
        isFeatured: isFeatured ? isFeatured === "true" : undefined, // we dont pass false so it ignores this clause
        isArchived: owner ? (isArchived ? isArchived === "true" : undefined) : false,
        price: priceFilter,
        ...(filterConditions.length > 0 && {
          AND: filterConditions,
        }),
      },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        maxQuantity: true,
        isFeatured: true,
        isArchived: true,
        images: {
          orderBy: {
            order: "asc",
          },
          select: {
            url: true,
          },
          take: 1,
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
    return NextResponse.json(paging ? pageBody(products, paging) : products, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCTS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
