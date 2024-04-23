import prismadb from "@/lib/prismadb";
import { cache } from "react";

export const getStoreURL = cache(async (storeId: string) => {
  const storeURL = await prismadb.store.findMany({
    where: {
      id:storeId
    },
    select:{
        url:true
    }
  });
  return storeURL[0].url;
});
