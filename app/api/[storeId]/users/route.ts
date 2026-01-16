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

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth();

    const body = await req.json();

    const { email, phone, fname, imgurl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!email) {
      return new NextResponse("email is required", { status: 400 });
    }

    if (!phone) {
      return new NextResponse("phone is required", { status: 400 });
    }

    if (!fname) {
      return new NextResponse("fname is required", { status: 400 });
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

    const user = await prismadb.users.create({
      data: {
        storeId: params.storeId,
        id: userId,
        email: email,
        phone: phone,
        fname: fname,
        imgurl: imgurl,
      },
    });

    return NextResponse.json(user, { headers: corsHeaders });
  } catch (error) {
    console.log("[USERS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }

    const users = await prismadb.users.findMany({
      where: {
        storeId: params.storeId,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json(users, { headers: corsHeaders });
  } catch (error) {
    console.log("[USERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
