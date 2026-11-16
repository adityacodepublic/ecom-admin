import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs/server";
import { Decimal } from "@prisma/client/runtime/library";

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
  { params }: { params: Promise<{ filterId: string; storeId?: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    const filter = await prismadb.filter.findUnique({
      where: {
        id: resolvedParams.filterId,
      },
      select: {
        id: true,
        name: true,
        value: {
          select: {
            value: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTER_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ filterId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }


    const filter = await prismadb.filter.delete({
      where: {
        id: resolvedParams.filterId,
      },
    });


    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTER_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ filterId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
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

    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    await prismadb.filter.update({
      where: {
        id: resolvedParams.filterId,
      },
      data: {
        name,
        value: {
          deleteMany: {},
        },
      },
    });

    const filter = await prismadb.filter.update({
      where: {
        id: resolvedParams.filterId,
      },
      data: {
        value: {
          createMany: {
            data: [
              ...value.map(
                (values: { value: Decimal; unit: String }) => values,
              ),
            ],
          },
        },
      },
    });


    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTER_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
