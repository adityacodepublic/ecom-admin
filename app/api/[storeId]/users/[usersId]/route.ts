import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
const corsHeaders = {
  "Access-Control-Allow-Origin": `${process.env.ACCESS_CONTROL_ALLOW_ORIGIN}`,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { usersId: string, storeId: string } }
) {
  try {
    if (!params.usersId) {
      return new NextResponse("User id is required", { status: 400 });
    }

    if (!params.storeId) {
      return new NextResponse("Store id is required", { status: 400 });
    }
    const user = await prismadb.users.findUnique({
      where: {
        id: params.usersId
      },
      select: {
        fname:true,
        phone:true,
        address:{
          select:{
            id:true,
            value:true,
            pincode:true,
          }
        },
        orders:{
          select:{
            isPaid:true,
            status:true,
            addressId:true,
            orderItems:{
              select:{
                orderQuantity:true,
                product:{
                  select:{
                    id:true,
                    name:true,
                    price:true,
                    size:{
                      select:{
                        name:true
                      }
                    },
                    color:{
                      select:{
                        name:true,
                        value:true
                      }
                    },
                    images:{
                      select:{
                        url:true
                      }
                    }
                  }
                }
              },
            },
          },
          orderBy:{
            createdAt:'desc'
          }
        },
      },
    });
  
    return NextResponse.json({user},{headers: corsHeaders});
  } catch (error) {
    console.log('[USER_GET]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};

export async function DELETE(
  req: Request,
  { params }: { params: { usersId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!params.usersId) {
      return new NextResponse("User id is required", { status: 400 });
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

    const user = await prismadb.users.delete({
      where: {
        id: params.usersId
      },
    });
  
    return NextResponse.json(user);
  } catch (error) {
    console.log('[PRODUCT_DELETE]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};


export async function PATCH(
  req: Request,
  { params }: { params: { usersId: string, storeId: string } }
) {
  try {
    const { userId } = auth();

    const body = await req.json();

    const { email,phone,fname,imgurl } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!params.usersId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    if (!email) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!phone) {
      return new NextResponse("Images are required", { status: 400 });
    }

    if (!fname) {
      return new NextResponse("Price is required", { status: 400 });
    }

    if (!imgurl) {
      return new NextResponse("Category id is required", { status: 400 });
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

    await prismadb.users.update({
      where: {
        id: params.usersId
      },
      data: {
        email:email,
        phone:phone,
        fname:fname,
        imgurl:imgurl,
      },
    });

  } catch (error) {
    console.log('[USER_PATCH]', error);
    return new NextResponse("Internal error", { status: 500 });
  }
};
