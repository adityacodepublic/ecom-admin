import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { Decimal } from "@prisma/client/runtime/library";
import axios from "axios";
import { getStoreURL } from "@/actions/get-storeUrl";
import {getURL } from '@/lib/_allowedDomains/domains';


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
  { params }: { params: { filterId: string } }
) {
  try {
    if (!params.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    const filter = await prismadb.filter.findUnique({
      where: {
        id: params.filterId
      },
      select:{
        id:true,
        name:true,
        value:{
          select:{
            value:true,
            unit:true
          },
        }
      }
    });
  
    return NextResponse.json(filter,{headers:corsHeaders});
  } catch (error) {
    console.log('[FILTER_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};

export async function DELETE(
  req: Request,
  { params }: { params: { filterId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }
    
    if (!params.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
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
    
    const store_url = getURL(params.storeId);

    const filter = await prismadb.filter.delete({
      where: {
        id: params.filterId
      }
    });
  
    try { 
      const response = await axios.post(`${store_url}/api/revalidate`, { tag:['filters'] });
      console.log(response.status);    
    } catch (error) {
      console.error('Error processing revalidation:', error);    
    }
    
    return NextResponse.json(filter,{headers:corsHeaders});
  } catch (error) {
    console.log('[FILTER_DELETE]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};


export async function PATCH(
  req: Request,
  { params }: { params: { filterId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    const body = await req.json();
    
    const { name, feature, value, group } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!value) {
      return new NextResponse("Value is required", { status: 400 });
    }

    if (feature === undefined || feature === null) {
      return new NextResponse("Feature is required", { status: 400 });
    }
    
    if (!group) {
      return new NextResponse("Group is required", { status: 400 });
    }

    if (!params.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Filter id is required", { status: 400 });
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
    
    await prismadb.filter.update({
      where: {
        id: params.filterId
      },
      data: {
        name,
        feature,
        value: {
          deleteMany:{}
        },
        filterGroupItems:{
          deleteMany:{}
        }
      }
    });

    const filter = await prismadb.filter.update({
      where: {
        id: params.filterId
      },
      data:{
        value:{
          createMany:{
            data:[
              ...value.map((values: { value: Decimal, unit: String }) => values)
            ]    
          }
        },
        filterGroupItems:{
          createMany:{
            data:[
              ...group.map((group: { id: any}) => ({ filterGroupId: group.id }))
            ]
          }
        }
      }
    });
    
    const store_url = getURL(params.storeId);
    try { 
      const response = await axios.post(`${store_url}/api/revalidate`, { tag:['filters'] });
      console.log(response.status);    
    } catch (error) {
      console.error('Error processing revalidation:', error);    
    }
    
    return NextResponse.json(filter,{headers:corsHeaders});
  } catch (error) {
    console.log('[FILTER_PATCH]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
