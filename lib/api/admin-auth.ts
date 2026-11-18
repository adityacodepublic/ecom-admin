import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { OrderError } from "@/lib/orders/errors";

/**
 * Admin order routes: /api/* is public in proxy.ts, so every route checks here that the caller is signed in
 * to the ADMIN Clerk and owns this store. Returns the admin's Clerk user id. Throws OrderError.
 */
export async function requireStoreOwner(storeId: string): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new OrderError("UNAUTHENTICATED", "Sign in first");
  const store = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  // Same answer for "no such store" and "not yours": do not reveal other stores.
  if (!store) throw new OrderError("FORBIDDEN", "Not your store");
  return userId;
}

/**
 * Same check for server components (pages). Call it at the top of every page that reads store data: the
 * [storeId] layout also checks, but a page's data must not rely on the layout alone (on client-side
 * navigation Next can render a page segment without re-running the layout). Redirects instead of throwing.
 */
export async function requireStoreOwnerPage(storeId: string): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const store = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  if (!store) redirect("/");
  return userId;
}
