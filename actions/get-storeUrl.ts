import prismadb from "@/lib/prismadb";
import { unstable_cache } from "next/cache";

export const getStoreURL = async (storeId: string) =>{
  const returnUrl = unstable_cache(
    async (storeId: string) => {
      const storeURL = await prismadb.store.findUnique({
        where: {
          id: storeId,
        },
        select: {
          url: true,
        },
      });
      return storeURL?.url;
    },
    [storeId],
    {
      tags: ['storeurl', 'store_url'], 
      revalidate:86400
    }
  );
  return returnUrl;
}  

