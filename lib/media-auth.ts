import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

/**
 * Every media route calls this first. /api/* is public in proxy.ts, so the check lives here:
 * the user must be signed in and must own the store. Returns an error response, or null if fine.
 */
export async function checkStoreOwner(storeId: string): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthenticated", { status: 403 });
  const store = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  if (!store) return new NextResponse("Unauthorized", { status: 405 });
  return null;
}
