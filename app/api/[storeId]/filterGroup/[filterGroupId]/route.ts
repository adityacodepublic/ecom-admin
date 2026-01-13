import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";

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
  { params }: { params: { filterGroupId: string } }
) {
  try {
    if (!params.filterGroupId) {
      return new NextResponse("Group id is required", { status: 400 });
    }

    const color = await prismadb.filterGroup.findUnique({
      where: {
        id: params.filterGroupId
      },
      select:{
        id:true,
        name:true,
      }
    });
  
    return NextResponse.json(color,{headers:corsHeaders});
  } catch (error) {
    console.log('[COLOR_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};

export async function DELETE(
  req: Request,
  { params }: { params: { filterGroupId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!params.filterGroupId) {
      return new NextResponse("Group id is required", { status: 400 });
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

    const color = await prismadb.filterGroup.delete({
      where: {
        id: params.filterGroupId
      }
    });
  
    return NextResponse.json(color,{headers:corsHeaders});
  } catch (error) {
    console.log('[COLOR_DELETE]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};


export async function PATCH(
  req: Request,
  { params }: { params: { filterGroupId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    const body = await req.json();

    const { name } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!params.filterGroupId) {
      return new NextResponse("Color id is required", { status: 400 });
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

    const color = await prismadb.filterGroup.update({
      where: {
        id: params.filterGroupId
      },
      data: {
        name
      }
    });
  
    return NextResponse.json(color,{headers:corsHeaders});
  } catch (error) {
    console.log('[COLOR_PATCH]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
