import prismadb from "@/lib/prismadb";
import { cache } from "react";

export const getStores = cache(async () => {
  const storeURL = await prismadb.store.findMany({
    select:{
        url:true
    }
  });
  return storeURL.flatMap((item)=>(item.url));
});
