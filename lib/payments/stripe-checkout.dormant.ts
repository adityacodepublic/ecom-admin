/**
 * ABANDONED: Stripe is not used; orders are COD/manual. Kept for reference. Do not wire into checkout.
 * DORMANT. Not imported anywhere and never called: customers pay cash on delivery for now.
 * This is the old Stripe card checkout from the removed POST /api/[storeId]/checkout route, kept only as a
 * starting point for the payments rework (each vendor with their own account). It is NOT fixed:
 *  - one platform Stripe key for every store (lib/stripe.ts)
 *  - stock is now taken at checkout (lib/orders/create.ts), but app/api/webhook still subtracts it again
 *  - it must use the order's frozen prices (details.items) and toPaise(), not live prices
 */
import Stripe from "stripe";

import prismadb from "@/lib/prismadb";
import { stripe } from "@/lib/stripe";
import { MoneyInput, toPaise } from "@/lib/money";
import { storeUrl } from "@/lib/store-url";

export async function createStripeCheckoutSessionDormant(
  storeId: string,
  orderId: string,
  email: string,
  products: { name: string; price: MoneyInput }[],
  quantities: number[],
) {
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = products.map((product, i) => ({
    quantity: quantities[i],
    price_data: {
      currency: "INR",
      product_data: { name: product.name },
      unit_amount: toPaise(product.price),
    },
  }));
  const store = await prismadb.store.findUniqueOrThrow({ where: { id: storeId }, select: { slug: true } });
  const storeBase = storeUrl(store.slug);
  const session = await stripe.checkout.sessions.create({
    line_items,
    mode: "payment",
    customer_email: email,
    success_url: `${storeBase}/cart?success=1`,
    cancel_url: `${storeBase}/cart?canceled=1`,
    metadata: { orderId },
  });
  return session.url;
}
