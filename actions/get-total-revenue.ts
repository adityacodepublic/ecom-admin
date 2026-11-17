import prismadb from "@/lib/prismadb";
import { toPaise } from "@/lib/money";

/** Paid revenue in PAISE: frozen order totals with paymentStatus PAID, cancelled orders left out. */
export const getTotalRevenue = async (storeId: string): Promise<number> => {
  const { _sum } = await prismadb.order.aggregate({
    where: { storeId, paymentStatus: "PAID", status: { not: "Cancelled" } },
    _sum: { total: true },
  });
  return toPaise(_sum.total ?? "0");
};
