import { ConfirmationEmail } from '@/components/emails/confirmation';
import { Resend } from 'resend';
import { render } from '@react-email/components';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req:Request, res:Response) {
    const {name,address,product,orderId,orderDate,contactPhone,email} = await req.json();
    // add store details
    const {data,error} = await resend.emails.send({
        from: "Acme <onboarding@resend.dev>",
        to:'website0wordpress@gmail.com',
        subject:"Thankyou",
        html: render(ConfirmationEmail({name,address,product,orderId,orderDate,contactPhone})),
    })

    if(error){
        return Response.json(error);
    }

    return Response.json({message:"Email Sent Successfully"});
}