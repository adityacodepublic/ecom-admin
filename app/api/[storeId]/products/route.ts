import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';

import prismadb from '@/lib/prismadb';

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();

    const body = await req.json();

    const { name, price, quantity, maxQuantity, categoryId, colorId, sizeId, images, isFeatured, isArchived } = body;

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

    if (!colorId) {
      return new NextResponse("Color id is required", { status: 400 });
    }

    if (!sizeId) {
      return new NextResponse("Size id is required", { status: 400 });
    }


    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId
      }
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
        colorId,
        sizeId,
        storeId: params.storeId,
        quantity,
        maxQuantity,
        images: {
          createMany: {
            data: [
              ...images.slice(0,8).map((image: { url: string }) => image),
            ],
          },
        },
      },
    });
  
    return NextResponse.json(product);
  } catch (error) {
    console.log('[PRODUCTS_POST]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};

export async function GET(
  req: Request,
  { params }: {params: { storeId: string }}
) {
  try {

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const colorId = searchParams.get("colorId") || undefined;
    const sizeId = searchParams.get("sizeId") || undefined;
    let   searchValue = searchParams.get('searchValue') || undefined;
    const isFeatured = searchParams.get("isFeatured")|| undefined;
    const isArchived = searchParams.get("isArchived")|| undefined;
    const price = Number(searchParams.get("price")) || undefined;

    const priceFilter: { gt?: number; lt?: number } = {};
    if (price && price > 0) {
        priceFilter.gt = price;
    } else if (price && price < 0) {
        priceFilter.lt = -1*price;
    }
    
    if (searchValue) {
      const words = searchValue.split(' ');
      words.push(searchValue);
      searchValue = words.join(' || ');
    }
    
    if (!params.storeId) {
        return new NextResponse("StoreId is required", { status: 400 });
    }

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        categoryId,
        colorId,
        sizeId,
        name: {
          contains: searchValue
        },
        isFeatured: isFeatured ? true : undefined, // we dont pass false so it ignores this clause
        isArchived: isArchived ? false : undefined, // we dont pass false so it ignores this clause
        price:priceFilter,
      },
      select: {
        id:true,
        name:true,
        price:true,
        quantity:true,
        maxQuantity:true,
        images:{
          select:{
            url:true
          },
          take: 2
        },
        category:{
          select:{
            id:true,
            name:true
          },
        },
        color:{
          select:{
            name:true,
            value:true
          }
        },
        size:{
          select:{
            name:true,
            value:true
          }
        },
      }
    });
  
    return NextResponse.json(products);
  } catch (error) {
    console.log('[PRODUCTS_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};