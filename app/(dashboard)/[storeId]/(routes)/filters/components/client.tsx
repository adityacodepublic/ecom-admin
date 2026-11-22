"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { use } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { columns, FilterColumn } from "./columns";

interface FiltersClientProps {
  data: Promise<FilterColumn[]>; // Started on the server and not awaited there: read here with use(), inside the page's <Suspense>.
}

export const FiltersClient: React.FC<FiltersClientProps> = ({
  data: rows
}) => {
  const data = use(rows);
  const params = useParams();
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading title={`Filters (${data.length})`} description="Manage filters for your products" />
        <Button onClick={() => router.push(`/${params.storeId}/filters/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Add New
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="name" columns={columns} data={data} />
    </>
  );
};
