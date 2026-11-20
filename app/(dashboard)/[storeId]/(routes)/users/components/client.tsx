"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import { clarityColumn, columns, UserColumn } from "./columns";

interface UserClientProps {
  data: UserColumn[];
  page: number;
  pageSize: number;
  totalCount: number;
  q: string;
  clarityConnected: boolean; // shows the "Copy Clarity ID" column
}

export const UserClient: React.FC<UserClientProps> = ({
  data,
  page,
  pageSize,
  totalCount,
  q,
  clarityConnected,
}) => {
  const params = useParams();
  const router = useRouter();
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const base = `/${params.storeId}/users`;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  // The search runs on the server over ALL customers (name, email, phone); typing waits a moment, then reloads.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => router.push(search.trim() ? `${base}?q=${encodeURIComponent(search.trim())}` : base), 400);
    return () => clearTimeout(t);
  }, [search, q, base, router]);

  return (
    <>
      <Heading title={`Customers (${totalCount})`} description="People who ordered from your store. Customers are never deleted." />
      <Separator />
      <Input
        placeholder="Search name, email or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <DataTable columns={clarityConnected ? [...columns, clarityColumn] : columns} data={data} />
      {pages > 1 && (
        <div className="flex items-center justify-end space-x-2 py-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={href(Math.max(1, page - 1))}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={page >= pages}>
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        </div>
      )}
    </>
  );
};
