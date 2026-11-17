import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { checkStoreOwner } from "@/lib/media-auth";

/**
 * Owner only: the ids of this store's customers (= users with at least one order in this store).
 * Customers are global now; Users.storeId is not used. The old POST (it created a customer row with the
 * ADMIN's own id) is removed: customers are created by the checkout or PATCH /customer/me.
 */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const denied = await checkStoreOwner(storeId);
    if (denied) return denied;

    const users = await prismadb.users.findMany({
      where: { orders: { some: { storeId } } },
      select: { id: true },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.log("[USERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
