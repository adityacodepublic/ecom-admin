"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { use, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { ProductColumn, productColumns } from "./columns";

interface ProductsClientProps {
  // Started on the server and not awaited there: read here with use(), inside the page's <Suspense>.
  data: Promise<{ rows: ProductColumn[]; filters: { id: string; name: string }[] }>;
}

export const ProductsClient: React.FC<ProductsClientProps> = ({ data: promise }) => {
  const { rows, filters } = use(promise);
  const params = useParams();
  const router = useRouter();
  const columns = useMemo(() => productColumns(filters), [filters]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Heading title={`Products (${rows.length})`} description="Manage products for your store. Click a column title to filter by it." />
        <Button onClick={() => router.push(`/${params.storeId}/products/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Add New
        </Button>
      </div>
      <Separator className="my-5" />
      <DataTable searchKey="name" columns={columns} data={rows} />
    </>
  );
};
