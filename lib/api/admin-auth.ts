import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { OrderError } from "@/lib/orders/errors";

/** Single source of truth for checking whether `userId` owns `storeId`. */
export async function isStoreOwner(storeId: string, userId: string): Promise<boolean> {
  if (!storeId || !userId) return false;
  const store = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  return !!store;
}

/**
 * Admin order/settings routes: checks via `getUserId()` (Clerk session or agent AsyncLocalStorage)
 * that the caller is signed in and owns this store. Returns the admin's Clerk user id. Throws OrderError.
 */
export async function requireStoreOwner(storeId: string): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new OrderError("UNAUTHENTICATED", "Sign in first");
  // Same answer for "no such store" and "not yours": do not reveal other stores.
  if (!(await isStoreOwner(storeId, userId))) throw new OrderError("FORBIDDEN", "Not your store");
  return userId;
}

/**
 * Plain NextResponse admin routes: uses `getUserId()` (preserving the AsyncLocalStorage agent path)
 * and returns 401 when unauthenticated or 403 when not the store owner.
 */
export async function requireStoreOwnerResponse(
  storeId: string | undefined,
): Promise<{ userId: string } | { error: NextResponse }> {
  const userId = await getUserId();
  if (!userId) return { error: new NextResponse("Unauthenticated", { status: 401 }) };
  if (!storeId || !(await isStoreOwner(storeId, userId))) {
    return { error: new NextResponse("Forbidden", { status: 403 }) };
  }
  return { userId };
}

/**
 * Clerk-session-only guard for routes that agents may never call (e.g. store creation or slug availability).
 */
export async function requireSessionUserResponse(): Promise<{ userId: string } | { error: NextResponse }> {
  const { userId } = await auth();
  if (!userId) return { error: new NextResponse("Unauthenticated", { status: 401 }) };
  return { userId };
}

/**
 * Clerk-session-only store ownership guard for store management routes (/api/stores/[storeId]*).
 */
export async function requireSessionStoreOwnerResponse(
  storeId: string | undefined,
): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await requireSessionUserResponse();
  if ("error" in session) return session;
  if (!storeId || !(await isStoreOwner(storeId, session.userId))) {
    return { error: new NextResponse("Forbidden", { status: 403 }) };
  }
  return session;
}

/**
 * True only when the caller is the signed-in owner of this store (browser session or the agent proxy).
 * Never throws: no session (store front, scripts) simply means "public".
 */
export async function callerOwnsStore(storeId: string | undefined): Promise<boolean> {
  if (!storeId) return false;
  try {
    const userId = await getUserId();
    if (!userId) return false;
    return await isStoreOwner(storeId, userId);
  } catch {
    return false;
  }
}

/**
 * Same check for server components (pages/layouts). Call it at the top of every page that reads store data:
 * wrapped with React `cache()` so `[storeId]/layout.tsx` and each dashboard `page.tsx` share one DB lookup
 * per request. Uses Clerk's `redirectToSignIn()` to preserve return URLs and `NEXT_PUBLIC_CLERK_SIGN_IN_URL`.
 */
export const requireStoreOwnerPage = cache(async (storeId: string): Promise<string> => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  if (!(await isStoreOwner(storeId, userId))) redirect("/");
  return userId;
});
