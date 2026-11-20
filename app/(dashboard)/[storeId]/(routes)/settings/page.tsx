import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

import { getContact } from "@/lib/contact";
import { parseClarityProjectId, parseLogo, parseLogoOnly } from "@/lib/store-settings";
import { AnalyticsSection } from "./components/analytics-section";
import { LogoSection } from "./components/logo-section";
import { getOrderSettings } from "@/lib/orders/settings";
import { SettingsForm } from "./components/settings-form";
import { ContactSection } from "./components/contact-section";
import { TransferCard } from "./components/transfer-card";
import { AgentAccessCard } from "./components/agent-access-card";
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
    // SettingsForm is a client component: only the columns it uses (never agentAccess).
    select: { id: true, name: true, slug: true, settings: true },
  });

  if (!store) {
    redirect("/");
  }

  const orderSettings = (await getOrderSettings(store.id))!;
  const contact = (await getContact(store.id))!;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <SettingsForm initialData={{ id: store.id, name: store.name, slug: store.slug }}>
          <LogoSection storeId={store.id} logo={parseLogo(store.settings)} logoOnly={parseLogoOnly(store.settings)} />
          <ContactSection storeId={store.id} initial={contact} />
          <AnalyticsSection storeId={store.id} slug={store.slug} clarityProjectId={parseClarityProjectId(store.settings)} />
        </SettingsForm>
        <h3 className="pt-4 text-lg font-semibold tracking-tight">Orders</h3>
        <OrderSettingsCard storeId={store.id} initial={orderSettings} />
        <h3 className="pt-4 text-lg font-semibold tracking-tight">Agent</h3>
        <AgentAccessCard storeId={store.id} />
        <h3 className="pt-4 text-lg font-semibold tracking-tight">Ownership</h3>
        <TransferCard storeId={store.id} />
      </div>
    </div>
  );
};

export default SettingsPage;
