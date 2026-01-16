import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import axios from "axios";
import { getStoreURL } from "@/actions/get-storeUrl";
import { getURL } from "@/lib/_allowedDomains/domains";

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
  { params }: { params: { productId: string } }
) {
  try {
    if (!params.productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    const product = await prismadb.product.findUnique({
      where: {
        id: params.productId,
      },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        maxQuantity: true,
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
  { params }: { params: { productId: string; storeId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!params.productId) {
      return new NextResponse("Product id is required", { status: 400 });
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

    const product = await prismadb.product.delete({
      where: {
        id: params.productId,
      },
    });

    // try {
    //   const response = await axios.post(`${store_url}/api/revalidate`, { path:[`/product/${params.productId}`,`/category/${product.categoryId}`, product.isFeatured? '/':''], tag:['products'] });
    //   console.log(response.status);
    // } catch (error) {
    //   console.error('Error processing revalidation:', error);
    // }

    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { productId: string; storeId: string } }
) {
  try {
    const { userId } = auth();

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
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!params.productId) {
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

    if (!quantity) {
      return new NextResponse("Quantity is required", { status: 400 });
    }

    if (!maxQuantity) {
      return new NextResponse("Max Quantity is required", { status: 400 });
    }

    if (!categoryId) {
      return new NextResponse("Category id is required", { status: 400 });
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

    await prismadb.product.update({
      where: {
        id: params.productId,
      },
      data: {
        name,
        price,
        categoryId,
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
        id: params.productId,
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
                    })
                  ),
                },
              }
            : undefined,
      },
    });

    // try {
    //   const response = await axios.post(`${store_url}/api/revalidate`, { path:[`/product/${params.productId}`,`/category/${product.categoryId}`, product.isFeatured? '/':''], tag:['products'] });
    //   console.log(response.status);
    // } catch (error) {
    //   console.error('Error processing revalidation:', error);
    // }

    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
