import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import axios from "axios";
import { getStoreURL } from "@/actions/get-storeUrl";
import { getURL } from "@/lib/_allowedDomains/domains";
import { log } from "console";

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
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();

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
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
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

    if (!quantity) {
      return new NextResponse("Quantity is required", { status: 400 });
    }

    if (!maxQuantity) {
      return new NextResponse("Max Quantity is required", { status: 400 });
    }

    if (!categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const store_url = getURL(params.storeId);

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    const product = await prismadb.product.create({
      data: {
        name,
        price,
        isFeatured,
        isArchived,
        categoryId,
        storeId: params.storeId,
        quantity,
        maxQuantity,
        images: {
          createMany: {
            data: [
              ...images.slice(1, 6).map((image: { url: string }) => image),
              //images[0]
            ],
          },
        },
      },
      include: {
        images: {
          select: {
            url: true,
          },
        },
      },
    });
    // const imageData = images.slice(1, 6).map((image: { url: string }) => ({
    //   productId: product.id,
    //   url: image.url,
    // }));

    const image = await prismadb.image.create({
      data: {
        productId: product.id,
        url: images[0].url,
      },
    });

    // try {
    //   const response = await axios.post(`${store_url}/api/revalidate`, { path:[`/category/${categoryId}`, product.isFeatured?'/':''], tag:['categories'] });
    //   console.log(response.status);
    // } catch (error) {
    //   console.error('Error processing revalidation:', error);
    // }

    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCTS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
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

    if (!params.storeId) {
      return new NextResponse("StoreId is required", { status: 400 });
    }

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        categoryId,
        name: {
          contains: searchValue,
        },
        isFeatured: isFeatured ? true : undefined, // we dont pass false so it ignores this clause
        isArchived: isArchived ? false : undefined, // we dont pass false so it ignores this clause
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
        images: {
          orderBy: {
            updatedAt: "desc",
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
    return NextResponse.json(products, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCTS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
