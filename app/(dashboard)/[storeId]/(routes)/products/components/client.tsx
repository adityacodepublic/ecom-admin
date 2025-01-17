"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { ApiList } from "@/components/ui/api-list";

import { ProductColumn, columns } from "./columns";
import  Loader  from "./loader"
import { useState } from "react";

interface ProductsClientProps {
  data: ProductColumn[];
};

export const ProductsClient: React.FC<ProductsClientProps> = ({
  data
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  
  return (
    <> 
      <div className="flex items-center justify-between">
        <Heading title={`Products (${data.length})`} description="Manage products for your store" />
        <div className="flex">
          <Button onClick={() => router.push(`/${params.storeId}/products/new`)}>
            <Plus className="mr-2 h-4 w-4" /> Add New
          </Button>
          <Button className='mx-5 mb-5' onClick={() => setOpen(!open)}>
            Load Data
          </Button>
        </div>
      </div>
      <Separator />
      {open &&(
        <div>
          <Loader/>  
          <Separator />
        </div>
      )}  
      <DataTable searchKey="name" columns={columns} data={data} />
      <Heading title="API" description="API Calls for Products" />
      <Separator />
      <ApiList entityName="products" entityIdName="productId" />
    </>
  );
};
