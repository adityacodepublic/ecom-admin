import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { Decimal } from "@prisma/client/runtime/library";
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
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();

    const body = await req.json();

    const { name, value } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!value) {
      return new NextResponse("Value is required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    const store_url = getURL(params.storeId);

    const filter = await prismadb.filter.create({
      data: {
        storeId: params.storeId,
        name,
        value: {
          createMany: {
            data: [
              ...value.map(
                (values: { storeId: string; value: Decimal; unit: string }) =>
                  values,
              ),
            ],
          },
        },
      },
    });

    // try {
    //   const response = await axios.post(`${store_url}/api/revalidate`, {
    //     tag: ["filters"],
    //   });
    //   console.log(response.status);
    // } catch (error) {
    //   console.error("Error processing revalidation:", error);
    // }

    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTERS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    if (name) {
      // Get specific filter by name
      const filter = await prismadb.filter.findUnique({
        where: {
          name: name,
        },
        select: {
          id: true,
          name: true,
          value: {
            select: {
              id: true,
              value: true,
              unit: true,
            },
          },
        },
      });
      return NextResponse.json(filter, { headers: corsHeaders });
    }

    // Get all filters for the store
    const filters = await prismadb.filter.findMany({
      where: {
        storeId: params.storeId,
      },
      select: {
        id: true,
        name: true,
        value: {
          select: {
            id: true,
            value: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(filters, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
