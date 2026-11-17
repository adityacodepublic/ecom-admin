import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

import { getContact } from "@/lib/contact";
import { getOrderSettings } from "@/lib/orders/settings";
import { SettingsForm } from "./components/settings-form";
import { ContactSection } from "./components/contact-section";
import { OrderSettingsCard } from "./components/order-settings-card";

const SettingsPage = async ({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) => {
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
  });

  if (!store) {
    redirect("/");
  }

  const orderSettings = (await getOrderSettings(store.id))!;
  const contact = (await getContact(store.id))!;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <SettingsForm initialData={store}>
          <ContactSection storeId={store.id} initial={contact} />
        </SettingsForm>
        <h3 className="pt-4 text-lg font-semibold tracking-tight">Orders</h3>
        <OrderSettingsCard storeId={store.id} initial={orderSettings} />
      </div>
    </div>
  );
};

export default SettingsPage;
