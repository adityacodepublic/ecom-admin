import { Suspense } from "react";

import Navbar from "@/components/navbar";
import { NavbarLoading } from "@/components/loading/navbar-loading";
import { requireStoreOwnerPage } from "@/lib/api/admin-auth";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreOwnerPage(storeId);

  return (
    <>
      <Suspense fallback={<NavbarLoading />}>
        <Navbar />
      </Suspense>
      {children}
    </>
  );
}
