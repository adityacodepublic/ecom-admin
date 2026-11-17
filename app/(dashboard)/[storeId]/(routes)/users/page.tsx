import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";
import { paiseToDecimalString, sumPaise, toPaise } from "@/lib/money";
import { parseDetailsOrNull } from "@/lib/orders/details";

import { UserColumn } from "./components/columns";
import { UserClient } from "./components/client";

// A store's customers = users with at least one order in THIS store (customers are global now).
// Only this store's orders are read. Purchases = paid, not cancelled orders, from frozen totals.
const UsersPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);
  const data = await prismadb.users.findMany({
    where: { orders: { some: { storeId } } },
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
    orderBy: { createdAt: "desc" },
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
        <UserClient data={formatted} />
      </div>
    </div>
  );
};

export default UsersPage;
