import prismadb from "@/lib/prismadb";

export const getTotalRevenue = async (storeId: string) => {
  const paidOrders = await prismadb.order.findMany({
    where: {
      storeId,
      isPaid: true
    },
    include: {
      orderItems: {
        include: {
          product: true,
        }
      }
    }
  });

  const totalRevenue = paidOrders.reduce((total: number, order: any) => {
    const orderTotal = order.orderItems.reduce((orderSum: number, item: any) => {
      return orderSum + item.product.price.toNumber() * item.orderQuantity;
    }, 0);
    return total + orderTotal;
  }, 0);

  return totalRevenue;
};
