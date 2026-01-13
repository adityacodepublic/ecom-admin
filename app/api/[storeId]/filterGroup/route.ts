import { NextResponse } from 'next/server';

import prismadb from '@/lib/prismadb';
import { auth } from '@clerk/nextjs';
 
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

    const { name} = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
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

    const color = await prismadb.filterGroup.create({
      data: {
        name,
        storeId: params.storeId
      }
    });
  
    return NextResponse.json(color,{headers:corsHeaders});
  } catch (error) {
    console.log('[COLORS_POST]', error);
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

    const colors = await prismadb.filterGroup.findMany({
      where: {
        storeId: params.storeId
      },
      select:{
        id:true,
        name:true
      }
    });
  
    return NextResponse.json(colors,{headers:corsHeaders});
  } catch (error) {
    console.log('[COLORS_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
