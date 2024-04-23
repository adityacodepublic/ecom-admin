import Stripe from "stripe";
import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import axios from "axios";
import { getStoreURL } from "@/actions/get-store";

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
  const FRONTEND_STORE_URLS = await getStoreURL(params.storeId);
  // storeRevalidate  ${process.env.FRONTEND_STORE_URL}  revalidate in store patch

  // validate zod data
  const { cartItems, usersId, name, email, imgurl, phone, radio, address, zip, address_instructions, payradio} = await req.json();

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

  // Check User
  const user = await prismadb.users.findUnique({
    where:{
        id:usersId,
    },
  });

  //Else Create User
  if (!user){ 
      const user = await prismadb.users.create({
          data:{
              id:usersId,
              storeId:params.storeId,
              email:email,
              fname:name,
              phone:phone,
              imgurl:imgurl,
          }
      })
  }
  else{
  //Compare / Update User Data
    let updateData: { email?: string, fname?: string, phone?: string, imgurl?: string } = {};

    if (user.email != email) {
      updateData.email = email;
    }
    if (user.fname != name) {
      updateData.fname = name;
    }
    if (user.phone != phone) {
      updateData.phone = phone;
    }
    if(user.imgurl != imgurl) {
      updateData.imgurl = imgurl;
    }
    
    if (Object.keys(updateData).length > 0) {
      await prismadb.users.update({
          where: {
              id: usersId,
          },
          data: updateData,
      });
    }; 
  }



  //create new address
  let newaddress;
  if (radio==="new"){
    newaddress = await prismadb.address.create({
      data:{
        usersId:usersId,
        value:address,
        instructions:address_instructions,
        pincode:zip
      }
    })
  };

  const order = await prismadb.order.create({
    data: {
      storeId: params.storeId,
      usersId: usersId,
      addressId: radio==="new" ? newaddress?.id : radio,
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

  const emailaddress = await prismadb.address.findUnique({
    where:{
      id:radio==="new" ? newaddress?.id : radio
    }
  })

  // Email details 
  const date = new Date();
  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  let currentDate = `${day}-${month}-${year}`; 

  const productData = cartItems.map((product:any) => ({name:product.name.slice(0,20), url: product.images.map((image:any)=>(image.url))[0]}));
  const emailData = {
    name:user?.fname||" ",
    address: emailaddress?.value||" ",
    product:productData,
    orderId:order.id.slice(5,25),
    orderDate:currentDate,
    contactPhone:"+91 963891738",
    email:email
  }
  console.log("Email Data");
  console.log(emailData);
  // Payment Process ------------>

  switch(payradio){
    case "card":
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
    
      const session = await stripe.checkout.sessions.create({
        //custom_fields
        line_items,
        mode: 'payment',
        customer_email:email,
        // billing_address_collection: 'required',
        // phone_number_collection: {
        //   enabled: true,
        // },
        success_url: `${FRONTEND_STORE_URLS}/cart?success=1`,
        cancel_url: `${FRONTEND_STORE_URLS}/cart?canceled=1`,
        metadata: {
          orderId: order.id
        },
      });
      try{
        axios.post(`/api/${params.storeId}/mail/orderConfirm`, emailData);
      } catch(error:any){
        console.error('Something went wrong.');
      }
      return NextResponse.json({ url: session.url }, {
        headers: corsHeaders
      });
    break;


    case "cod":
      const updatecod = await prismadb.order.update({
        where: {
          id:order.id,
        },
        data: {
          payment:"COD",
        },
      }); 
      if(updatecod){
        try{
          axios.post(`/api/${params.storeId}/mail/orderConfirm`, emailData);
        } catch(error:any){
          console.log('Something went wrong.');
        }
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/cart?success=1` }, {
          headers: corsHeaders
        });
      }
      else{
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/cart?cancelled=1` }, {
          headers: corsHeaders
        });
      }
    break;


    case "upi":
      const updateupi = await prismadb.order.update({
        where: {
          id:order.id,
        },
        data: {
          payment:"upi",
          isPaid:true
        },
      }); 
      if(updateupi){
        try{
          axios.post(`/api/${params.storeId}/mail/orderConfirm`, emailData);
        } catch(error:any){
          console.log('Something went wrong.');
        }
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/pay/UPI` }, {
          headers: corsHeaders
        });
      }
      else{
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/cart?cancelled=1` }, {
          headers: corsHeaders
        });
      }
    break;


    case "netbanking":
      const updatenetb = await prismadb.order.update({
        where: {
          id:order.id,
        },
        data: {
          payment:"net banking",
          isPaid:true
        },
      }); 
      if(updatenetb){
        try{
          axios.post(`/api/${params.storeId}/mail/orderConfirm`, emailData);
        } catch(error:any){
          console.log('Something went wrong.');
        }
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/payment/NET Banking` }, {
          headers: corsHeaders
        });
      }
      else{
        return NextResponse.json({ url: `${FRONTEND_STORE_URLS}/cart?cancelled=1` }, {
          headers: corsHeaders
        });
      }
    break;
  
  }
};
