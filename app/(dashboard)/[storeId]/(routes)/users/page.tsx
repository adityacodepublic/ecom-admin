import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { parsePaging } from "@/lib/api/validate";
import prismadb from "@/lib/prismadb";
import { paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { parseDetailsOrNull } from "@/lib/orders/details";
import { parseClarityProjectId, readSettings } from "@/lib/store-settings";

import { UserColumn } from "./components/columns";
import { UserClient } from "./components/client";

// A store's customers = users with at least one order in THIS store (customers are global now).
// Only this store's orders are read. Purchases = paid, not cancelled orders, from frozen totals.
const UsersPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);
  // Pages of 50 customers (?page=N). A bad page number falls back to page 1.
  // ?q= searches ALL of this store's customers (name, email, phone), not just the page on screen.
  const sp = await searchParams;
  const paging = parsePaging(new URLSearchParams(sp.page ? { page: String(sp.page) } : {}));
  const { page, pageSize } = paging.ok ? paging.data : { page: 1, pageSize: 50 };
  const q = (sp.q ?? "").trim().slice(0, 100);
  const where = {
    orders: { some: { storeId } },
    ...(q
      ? {
          OR: [
            { fname: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const totalCount = await prismadb.users.count({ where });
  const data = await prismadb.users.findMany({
    where,
    select: {
      id: true,
      fname: true,
      email: true,
      phone: true,
      imgurl: true,
      orders: {
        where: { storeId },
        select: { id: true, total: true, paymentStatus: true, status: true, details: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const formatted: UserColumn[] = data.map((user) => {
    const paid = user.orders.filter((o) => o.paymentStatus === "PAID" && o.status !== "Cancelled");
    const productCount: Record<string, number> = {};
    for (const o of paid) {
      for (const item of parseDetailsOrNull(o.id, o.details)?.items ?? []) {
        const name = item.name.slice(0, 30);
        productCount[name] = (productCount[name] ?? 0) + item.quantity;
      }
    }
    const latest = parseDetailsOrNull(user.orders[0]?.id ?? "", user.orders[0]?.details);
    return {
      id: user.id,
      fname: user.fname,
      orderCount: user.orders.length,
      email: user.email,
      phone: user.phone,
      address: latest ? `${latest.shipTo.address} - ${latest.shipTo.pincode}` : "",
      products: Object.entries(productCount)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => `${name}(${count})`)
        .join(", "),
      // Rupees with paise as text, exact (the column shows a ₹ sign before it).
      totalPrice: paiseToDecimalString(sumPaise(paid.map((o) => toPaise(o.total)))),
      imgurl: user.imgurl || "/white.png",
    };
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <UserClient data={formatted} page={page} pageSize={pageSize} totalCount={totalCount} q={q} clarityConnected={!!parseClarityProjectId(await readSettings(storeId))} />
      </div>
    </div>
  );
};

export default UsersPage;
