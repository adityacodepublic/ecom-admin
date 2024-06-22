import prismadb from "@/lib/prismadb";
import { unstable_cache } from "next/cache";

export const getStoreURL = unstable_cache(
  async (storeId: string) => {
    const storeURL = await prismadb.store.findUnique({
      where: {
        id:storeId
      },
      select:{
          url:true
      }
    });
    return storeURL?.url;
  },
  ['a req'],
  { tags: ['storeurl','store_url']}
);

