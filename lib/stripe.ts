// ABANDONED: Stripe is not used; orders are COD/manual. Kept for reference. Do not wire into checkout.
import Stripe from "stripe";

let client: Stripe | null = null;

/** Created on first use, so a missing STRIPE_API_KEY never breaks an import or the build. */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_API_KEY;
    if (!key) throw new Error("STRIPE_API_KEY is not set (Stripe is abandoned)");
    client = new Stripe(key, { apiVersion: "2023-10-16", typescript: true });
  }
  return client;
}

export const stripe = new Proxy({} as Stripe, {
  get: (_target, prop) => Reflect.get(getStripe(), prop),
});
