import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Suspense } from "react";

import Navbar from "@/components/navbar";
import { NavbarLoading } from "@/components/loading/navbar-loading";
import prismadb from "@/lib/prismadb";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const resolvedParams = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: resolvedParams.storeId,
      userId,
    },
    select: { id: true },
  });

  if (!store) {
    redirect("/");
  }

  return (
    <>
      <Suspense fallback={<NavbarLoading />}>
        <Navbar />
      </Suspense>
      {children}
    </>
  );
}
