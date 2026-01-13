import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { revalidateTag } from "next/cache";
import { deleteStore, patchUrl } from "@/lib/_allowedDomains/domains";
export const revalidate = 0; 

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const { name, url } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }    
    
    if (!url) {
      return new NextResponse("URL is required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const store = await prismadb.store.update({
      where: {
        id: params.storeId,
        userId,
      },
      data: {
        name,
        url
      }
    });
  
    patchUrl(params.storeId,url);
    try { 
      revalidateTag('storeurl');
      revalidateTag('store_url'); 
    } catch (error) {
      console.error('Error processing revalidation:', error);    
    }
    return NextResponse.json(store);
  } catch (error) {
    console.log('[STORE_PATCH]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};


export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    };

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    };

    const store = await prismadb.store.deleteMany({
      where: {
        id: params.storeId,
        userId
      }
    });
    
    deleteStore(params.storeId);
    try { 
      revalidateTag('storeurl');
      revalidateTag('store_url'); 
    } catch (error) {
      console.error('Error processing revalidation:', error);    
    }
    
    return NextResponse.json(store);
  } catch (error) {
    console.log('[STORE_DELETE]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
