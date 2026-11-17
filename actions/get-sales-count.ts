import prismadb from "@/lib/prismadb";

/** Paid orders (paymentStatus PAID), cancelled orders left out. */
export const getSalesCount = async (storeId: string) => {
  return prismadb.order.count({
    where: { storeId, paymentStatus: "PAID", status: { not: "Cancelled" } },
  });
};
