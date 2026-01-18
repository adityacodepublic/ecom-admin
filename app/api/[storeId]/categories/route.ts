import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();

    const body = await req.json();

    const { name, billboardId, imageUrl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!billboardId) {
      return new NextResponse("Billboard ID is required", { status: 400 });
    }

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400 });
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const store_url = getURL(resolvedParams.storeId);

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    const category = await prismadb.category.create({
      data: {
        name,
        billboardId,
        imageUrl,
        storeId: resolvedParams.storeId,
      },
    });

    // try {
    //   const response = await axios.post(`${store_url}/api/revalidate`, { tag:['categories'] });
    //   console.log(response.status);
    // } catch (error) {
    //   console.error('Error processing revalidation:', error);
    // }

    return NextResponse.json(category, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORIES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const categories = await prismadb.category.findMany({
      where: {
        storeId: resolvedParams.storeId,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
      },
    });

    return NextResponse.json(categories, { headers: corsHeaders });
  } catch (error) {
    console.log("[CATEGORIES_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
