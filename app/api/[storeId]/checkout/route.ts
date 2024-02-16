import Stripe from "stripe";
import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";

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
  { params }: { params: { storeId: string} }
) {
  const { cartItems, usersId, fname, email, imgurl } = await req.json();

  if (!cartItems || cartItems.length === 0) {
    return new NextResponse("Product ids are required", { status: 400 });
  };

  // Find Products 
  const products = await prismadb.product.findMany({
    where: {
      id: {
        in: cartItems.map((product:any)=>product.id),
      }
    }
  });

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  // Product List
  products.forEach((product) => {
    const orderItem = cartItems.find((item:any)=> item.id === product.id);
    line_items.push({
      quantity: orderItem.orderQuantity,
      price_data: {
        currency: 'INR',
        product_data: {
          name: product.name,
        },
        unit_amount: product.price.toNumber() * 100
      }
    });
  });

  // Check User
  const user = await prismadb.users.findUnique({
    where:{
        id:usersId,
    },
  });
  //else create user
  if (user==null){ 
      const user = await prismadb.users.create({
          data:{
              id:usersId,
              storeId:params.storeId,
              email:email,
              fname:fname,
              imgurl:imgurl,
          }
      })
  }
  else{
  // compare/update data
      if (user?.email!=email){
          await prismadb.users.update({
              where:{
                  id:usersId,
              },
              data:{
                  email:email,
              },
          })
      } 
      if (user?.fname!=fname){
          await prismadb.users.update({
              where:{
                  id:usersId,
              },
              data:{
                  fname:fname,
              },
          })
      } 
  //     if (user?.imgurl!=imgurl){
  //     await prismadb.users.update({
  //         where:{
  //             id:usersId,
  //         },
  //         data:{
  //             imgurl:imgurl,
  //         },
  //     })
  // } 
  }
  
  
  const order = await prismadb.order.create({
    data: {
      storeId: params.storeId,
      usersId: usersId,
      isPaid: false,
      orderItems: {
        create: products.map((item: any) => {
          const cartItem = cartItems.find((orderItem: any)=> item.id === orderItem.id);
          return {
            product: {
              connect: {
                id: item.id,
              },
            },
            orderQuantity: cartItem.orderQuantity
          };

        }),
      },
    },
  });

  const session = await stripe.checkout.sessions.create({
    //custom_fields
    line_items,
    mode: 'payment',
    customer_email:email,
    billing_address_collection: 'required',
    phone_number_collection: {
      enabled: true,
    },
    success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
    cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
    metadata: {
      orderId: order.id
    },
  });

  return NextResponse.json({ url: session.url }, {
    headers: corsHeaders
  });
};
