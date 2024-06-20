import { ConfirmationEmail } from '@/components/emails/confirmation';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

let response = NextResponse;

export async function POST(
    req:Request, 
    { params }: { params: { storeId: string } }
) {
    try {
        if (!params.storeId) {
            return new NextResponse("Store id is required", { status: 400 });
        }

        const {name,address,product,orderId,orderDate,contactPhone,email} = await req.json();
        // add store details
        const {data,error} = await resend.emails.send({
            from: "Acme <onboarding@resend.dev>",
            to:"website0wordpress@gmail.com",
            subject:"Thankyou",
            html: render(ConfirmationEmail({name,address,product,orderId,orderDate,contactPhone})),
        })

        return response.json({message:"Email Sent Successfully"});
    } catch (error) {
        return new response("Internal error", { status: 500});
    }
};