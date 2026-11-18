// ABANDONED: Stripe is not used; orders are COD/manual. Kept for reference. Do not wire into checkout.
//
// This route used to mark orders PAID and subtract stock when Stripe called it. It must never change an order or
// stock again (stock is taken at checkout, in lib/orders/create.ts), so it only answers 410 Gone.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ error: "Stripe webhooks are not used here" }, { status: 410 });
}
