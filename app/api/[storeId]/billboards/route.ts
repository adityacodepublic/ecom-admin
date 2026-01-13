import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';

import prismadb from '@/lib/prismadb';
import axios from 'axios';
import { getStoreURL } from '@/actions/get-storeUrl';
import {getURL } from '@/lib/_allowedDomains/domains';


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

    const { label, images } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!label) {
      return new NextResponse("Label is required", { status: 400 });
    }


    if (!images || !images.length) {
      return new NextResponse("Images are required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const store_url = getURL(params.storeId);

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      }
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    const billboard = await prismadb.billboard.create({
      data: {
        label,
        storeId: params.storeId,
        images: {
          createMany: {
            data: [
              ...images.map((image: { url: string }) => image)
            ],
          },
        },
      },
    });
    
    try { 
      const response = await axios.post(`${store_url}/api/revalidate`, { tag:['billboards'] });
      console.log(response.status);    
    } catch (error) {
      console.error('Error processing revalidation:', error);    
    }
    
    return NextResponse.json(billboard,{headers: corsHeaders});
  } catch (error) {
    console.log('[BILLBOARDS_POST]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const billboards = await prismadb.billboard.findMany({
      where: {
        storeId: params.storeId
      },
      select:{
        label:true,
        images:{
          select:{
            url:true
          }
        }
      }
    });
  
    return NextResponse.json(billboards,{headers:corsHeaders});
  } catch (error) {
    console.log('[BILLBOARDS_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
