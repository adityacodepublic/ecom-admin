import Stripe from "stripe"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { stripe } from "@/lib/stripe"
import prismadb from "@/lib/prismadb"

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get("Stripe-Signature") as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error: any) {
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // const address = session?.customer_details?.address;
  
  // const addressComponents = [
  //   address?.line1,
  //   address?.line2,
  //   address?.city,
  //   address?.state,
  //   address?.postal_code,
  //   address?.country
  // ];
  // const addressString = addressComponents.filter((c) => c !== null).join(', ');


  if (event.type === "checkout.session.completed") {
    const order = await prismadb.order.update({
      where: {
        id: session?.metadata?.orderId,
      },
      data: {
        isPaid: true,
      },
      include: {
        // users: true,
        orderItems: true,
      }
    });
  
    // // Update the user details
    // await prismadb.users.update({
    //   where: {
    //     id: order.usersId,
    //   },
    //   data: {
    //     phone: session?.customer_details?.phone || '',
    //     //email: session?.customer_details?.email || '',
    //   },
    // });
  
    const productIds = order.orderItems.map((orderItem) => orderItem.productId);
  
      // Fetch the products from the database
      const products = await prismadb.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });

      // Update the quantities
      for (const orderItem of order.orderItems) {
        const product = products.find((p) => p.id === orderItem.productId);
        if (product) {
          // Subtract orderItem.orderQuantity from the existing quantity
          const newQuantity = Math.max(product.quantity - orderItem.orderQuantity, 0);

          // Update the product's quantity
          await prismadb.product.update({
            where: { id: product.id },
            data: { 
              quantity: newQuantity, 
              isArchived: newQuantity === 0 },
          });
        }
      }

  }

  return new NextResponse(null, { status: 200 });

};
