import { createHash, timingSafeEqual } from "crypto";

import { OrderError } from "@/lib/orders/errors";

/**
 * Customer routes. The store app and the admin use DIFFERENT Clerk instances, so the admin cannot check a
 * shopper's Clerk token. Instead, only the store app's SERVER (server actions / route handlers, never the
 * browser) calls these routes, with two headers:
 *   x-store-secret: STORE_API_SECRET   (same value in both Vercel projects; never NEXT_PUBLIC_)
 *   x-customer-id:  the Clerk user id the store verified with its own auth()
 * The admin trusts x-customer-id ONLY when the secret matches. Fails closed when the secret is not set.
 */
export const STORE_SECRET_HEADER = "x-store-secret";
export const CUSTOMER_ID_HEADER = "x-customer-id";
const MIN_SECRET_LENGTH = 32;

const digest = (s: string) => new Uint8Array(createHash("sha256").update(s, "utf8").digest());

/** Throws OrderError unless the request carries the right secret. */
export function verifyStoreSecret(req: Request): void {
  const secret = process.env.STORE_API_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error("[STORE_API_SECRET] not set or shorter than 32 characters: customer routes are closed");
    throw new OrderError("NOT_CONFIGURED", "The store API is not configured");
  }
  const given = req.headers.get(STORE_SECRET_HEADER) ?? "";
  // Hash both sides first: same length for timingSafeEqual, and the time does not depend on where they differ.
  if (!given || !timingSafeEqual(digest(given), digest(secret))) {
    throw new OrderError("UNAUTHENTICATED", "Not allowed");
  }
}

/** Secret + the verified customer id. Throws OrderError. */
export function verifyCustomerRequest(req: Request): { customerId: string } {
  verifyStoreSecret(req);
  const customerId = (req.headers.get(CUSTOMER_ID_HEADER) ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(customerId)) throw new OrderError("UNAUTHENTICATED", "Sign in first");
  return { customerId };
}
