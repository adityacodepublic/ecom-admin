"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { ApiList } from "@/components/ui/api-list";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
      <Accordion
        key={'loadData'}
        type="single"
        collapsible
      >
      <AccordionItem value="item1">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <Heading title={`Products (${data.length})`} description="Manage products for your store" />
        <div className="flex gap-4">
          <Button onClick={() => router.push(`/${params.storeId}/products/new`)}>
            <Plus className="mr-2 h-4 w-4" /> Add New
          </Button>
          <AccordionTrigger arrow={false} className="p-0">
            <Button className='' onClick={() => setOpen(!open)}>
              <Plus className="mr-2 h-4 w-4" /> Load Data
            </Button>
          </AccordionTrigger>
        </div>
      </div>
      <Separator className="my-5" />
      <AccordionContent>
          <div>
            <Loader/>  
            <Separator className="mt-6 mb-2" />
          </div>
      </AccordionContent>
      <DataTable searchKey="name" columns={columns} data={data} />
      <Heading title="API" description="API Calls for Products" />
      <Separator />
      <ApiList entityName="products" entityIdName="productId" />
      </AccordionItem>
      </Accordion> 
    </>
  );
};
