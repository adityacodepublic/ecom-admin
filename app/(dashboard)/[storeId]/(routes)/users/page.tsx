import prismadb from "@/lib/prismadb";

import { UserColumn } from "./components/columns"
import { UserClient } from "./components/client";


const UsersPage = async ({
  params
}: {
  params: { storeId: string }
}) => {
  const data = await prismadb.users.findMany({
    where: {
      storeId: params.storeId
    },
    include: {
      orders:{
        include:{
          orderItems:{
            include:{
              product:true,
            }
          },
          address:{
            select:{
              value:true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });


  function getProductString(item: any): string {
    let productCount: { [key: string]: number } = {};
    item.orders.filter((items:any)=>(items.isPaid===true))
    .forEach((order: any) => 
      order.orderItems.forEach((orderItem: any) => {
        let product = orderItem.product.name.slice(0,30);
        productCount[product] = (productCount[product] || 0) + 1 * orderItem.orderQuantity;
      })
    );
    let productEntries = Object.entries(productCount);
    productEntries.sort((a, b) => a[0].localeCompare(b[0]));
    return productEntries.map(([product, count]) => `${product}(${count})`).join(', ');
  }

  const PaidTotalPrice = (item: any): number => {
    const totalPrice = item.orders
      .filter((order: any) => order.isPaid)
      .flatMap((order: any) =>
        order.orderItems.map((orderItem: any) => orderItem.product.price * orderItem.orderQuantity)
      )
      .reduce((total: number, price: number) => total + price, 0);
  
    const finalPrice = parseInt(totalPrice.toString(), 10) || 0;    
    return finalPrice;
  };

  
  
  const formattedOrders: UserColumn[] = data.map((item) => ({
    fname: item.fname,
    id: item.id,
    email: item.email,
    phone:item.phone,
    address:item.orders[2]?.address.value||item.orders[0]?.address.value,
    products: getProductString(item),  
    totalPrice: PaidTotalPrice(item),
    imgurl:item.imgurl||"/public/white.png",
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <UserClient data={formattedOrders} />
      </div>
    </div>
  );
};

export default UsersPage;
