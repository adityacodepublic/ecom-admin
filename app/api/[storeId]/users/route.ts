import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { checkStoreOwner } from "@/lib/media-auth";
import { parsePaging } from "@/lib/api/validate";

/**
 * Owner only: the ids of this store's customers (= users with at least one order in this store), newest first,
 * paginated: ?page= (default 1) and ?pageSize= (default 50, max 100).
 * Customers are global now; Users.storeId is not used. The old POST (it created a customer row with the
 * ADMIN's own id) is removed: customers are created by the checkout or PATCH /customer/me.
 */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const denied = await checkStoreOwner(storeId);
    if (denied) return denied;

    const paging = parsePaging(new URL(req.url).searchParams);
    if (!paging.ok) return new NextResponse(paging.error, { status: 400 });
    const { page, pageSize } = paging.data;

    const where = { orders: { some: { storeId } } };
    const [users, totalCount] = await Promise.all([
      prismadb.users.findMany({
        where,
        select: { id: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], // stable: id breaks ties
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prismadb.users.count({ where }),
    ]);
    return NextResponse.json({ users, page, pageSize, totalCount, hasMore: page * pageSize < totalCount });
  } catch (error) {
    console.log("[USERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
