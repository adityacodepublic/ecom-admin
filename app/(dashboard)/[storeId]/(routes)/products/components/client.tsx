"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";

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
import Loader from "./loader";
import { useState } from "react";
import { CellAction } from "./cell-action";

interface ProductsClientProps {
  data: ProductColumn[];
  filters: { id: string; name: string }[];
}

export const ProductsClient: React.FC<ProductsClientProps> = ({
  data,
  filters,
}) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Generate dynamic columns based on filters
  const dynamicColumns = useMemo<ColumnDef<ProductColumn>[]>(() => {
    const filterColumns = filters.map((filter) => ({
      accessorKey: filter.name,
      header: filter.name,
    }));

    // Insert filter columns before the "createdAt" column
    const baseColumns = [...columns];
    const createdAtIndex = baseColumns.findIndex(
      (col: any) => col.accessorKey === "createdAt"
    );

    if (createdAtIndex !== -1) {
      baseColumns.splice(createdAtIndex, 0, ...filterColumns);
    } else {
      // If createdAt not found, add at the end before actions
      const actionsIndex = baseColumns.findIndex(
        (col: any) => col.id === "actions"
      );
      if (actionsIndex !== -1) {
        baseColumns.splice(actionsIndex, 0, ...filterColumns);
      } else {
        baseColumns.push(...filterColumns);
      }
    }

    return baseColumns;
  }, [filters]);

  return (
    <>
      <Accordion key={"loadData"} type="single" collapsible>
        <AccordionItem value="item1">
          <div className="flex gap-2.5 items-center justify-between flex-wrap">
            <Heading
              title={`Products (${data.length})`}
              description="Manage products for your store"
            />
            <div className="flex gap-4">
              <Button
                onClick={() => router.push(`/${params.storeId}/products/new`)}
              >
                <Plus className="mr-2 h-4 w-4" /> Add New
              </Button>
              <AccordionTrigger arrow={false} className="p-0">
                <Button className="" onClick={() => setOpen(!open)}>
                  <Plus className="mr-2 h-4 w-4" /> Load Data
                </Button>
              </AccordionTrigger>
            </div>
          </div>
          <Separator className="my-5" />
          <AccordionContent>
            <div>
              <Loader />
              <Separator className="mt-6 mb-2" />
            </div>
          </AccordionContent>
          <DataTable searchKey="name" columns={dynamicColumns} data={data} />
          <Heading title="API" description="API Calls for Products" />
          <Separator />
          <ApiList entityName="products" entityIdName="productId" />
        </AccordionItem>
      </Accordion>
    </>
  );
};
