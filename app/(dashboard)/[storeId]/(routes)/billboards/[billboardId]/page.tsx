import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";

import { BillboardForm } from "./components/billboard-form";

const BillboardPage = async ({
  params,
}: {
  params: Promise<{ billboardId: string; storeId: string }>;
}) => {
  const resolvedParams = await params;
  const billboard = await prismadb.billboard.findFirst({
    where: {
      id: resolvedParams.billboardId,
      storeId: resolvedParams.storeId,
    },
    include: {
      images: true,
    },
  });

  // "new" is the create page. Any other id must be a billboard of THIS store.
  if (!billboard && resolvedParams.billboardId !== "new") notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6 pb-14">
        <BillboardForm initialData={billboard} />
      </div>
    </div>
  );
};

export default BillboardPage;
