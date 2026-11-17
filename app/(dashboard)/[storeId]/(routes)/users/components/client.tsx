"use client";

import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { columns, UserColumn } from "./columns";

interface UserClientProps {
  data: UserColumn[];
}

export const UserClient: React.FC<UserClientProps> = ({
  data
}) => {
  return (
    <>
      <Heading title={`Customers (${data.length})`} description="People who ordered from your store. Customers are never deleted." />
      <Separator />
      <DataTable searchKey="fname" columns={columns} data={data} />
    </>
  );
};
