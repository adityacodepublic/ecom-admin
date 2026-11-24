import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const store = await prismadb.store.findFirst({
    where: {
      userId,
    },
    select: { id: true },
  });

  if (store) {
    redirect(`/${store.id}`);
  }

  return <>{children}</>;
}
