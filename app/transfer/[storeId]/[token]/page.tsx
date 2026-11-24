import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { maskEmail, normalizeEmail, previewTransfer } from "@/lib/transfer";

import { AcceptModal } from "./accept-modal";

/** The page the new owner opens from the link. proxy.ts makes them sign in first and brings them back here. */
const TransferPage = async ({ params }: { params: Promise<{ storeId: string; token: string }> }) => {
  const { storeId, token } = await params;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const owns = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  if (owns) redirect(`/${storeId}`);

  const preview = await previewTransfer(storeId, token);
  if (preview.status !== "ok") {
    return <AcceptModal state={{ kind: preview.status }} storeId={storeId} token={token} />;
  }

  const user = await currentUser();
  const mine = (user?.emailAddresses ?? []).filter((e) => e.verification?.status === "verified").map((e) => normalizeEmail(e.emailAddress));
  if (!mine.includes(preview.email)) {
    return <AcceptModal state={{ kind: "wrong_account", email: maskEmail(preview.email) }} storeId={storeId} token={token} />;
  }
  return <AcceptModal state={{ kind: "ok", storeName: preview.storeName }} storeId={storeId} token={token} />;
};

export default TransferPage;
