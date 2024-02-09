import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

import { UserColumn } from "./components/columns"
import { UserClient } from "./components/client";
import { Decimal } from "@prisma/client/runtime";


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
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  let productCount: { [key: string]: number } = {};



  function getProductString(item: any): string {
    let productCount: { [key: string]: number } = {};
  
    item.orders.forEach((order: any) => 
      order.orderItems.forEach((orderItem: any) => {
        let product = orderItem.product.name;
        productCount[product] = (productCount[product] || 0) + 1;
      })
    );
    let productEntries = Object.entries(productCount);
    // Sort the entries by product name for consistent output
    productEntries.sort((a, b) => a[0].localeCompare(b[0]));
    return productEntries.map(([product, count]) => `${product}(${count})`).join(', ');
  }

  const PaidTotalPrice = (item: any): number => {
    const totalPrice = item.orders
      .filter((order: any) => order.isPaid)
      .flatMap((order: any) =>
        order.orderItems.map((orderItem: any) => orderItem.product.price)
      )
      .reduce((total: number, price: number) => total + price, 0);
  
    const finalPrice = parseInt(totalPrice.toString(), 10) || 0;    
    //console.log(finalPrice);
    return finalPrice;
  };

 const price = data.map((order)=>(order.orders.map((orderitem)=>(orderitem.orderItems.map((item)=>(item.product.price))))))
  
  
  const formattedOrders: UserColumn[] = data.map((item) => ({
    fname: item.fname,
    id: item.id,
    email: item.email,
    phone:item.phone,
    address:item.orders[0].address,
    products: getProductString(item),  
    totalPrice: PaidTotalPrice(item),
    imgurl:item.imgurl||"https://static.vecteezy.com/system/resources/thumbnails/021/911/748/small/white-circle-free-png.png",
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
