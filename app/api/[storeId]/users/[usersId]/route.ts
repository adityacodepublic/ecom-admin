import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";

/**
 * Owner only. A customer of THIS store (someone with an order here). Before, GET was public and returned
 * phone, addresses and all orders to anybody (B3); the store app now uses GET /api/[storeId]/customer/me
 * and /customer/orders instead. There is no DELETE (a customer is never deleted: orders must stay) and no
 * PATCH (customers are global: only the customer edits their own profile, via PATCH /customer/me).
 */

type Params = { params: Promise<{ usersId: string; storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { storeId, usersId } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;

    const user = await prismadb.users.findFirst({
      where: { id: usersId, orders: { some: { storeId } } },
      select: {
        id: true,
        fname: true,
        email: true,
        phone: true,
        imgurl: true,
        createdAt: true,
      },
    });
    if (!user) return new NextResponse("Not found", { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    console.log("[USER_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
