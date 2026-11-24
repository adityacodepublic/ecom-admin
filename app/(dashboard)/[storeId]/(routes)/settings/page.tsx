import { redirect } from "next/navigation";

import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import prismadb from "@/lib/prismadb";

import { parseContact } from "@/lib/contact";
import { parseClarityApiToken, parseClarityProjectId, parseLogo, parseLogoOnly } from "@/lib/store-settings";
import { AnalyticsSection } from "./components/analytics-section";
import { LogoSection } from "./components/logo-section";
import { parseOrderSettings } from "@/lib/orders/settings";
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
  const userId = await requireStoreOwnerPage(resolvedParams.storeId);

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

  // Every section reads the store row loaded above (no second read of the same row).
  const orderSettings = parseOrderSettings(store.settings);
  const contact = parseContact(store.settings);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <SettingsForm initialData={{ id: store.id, name: store.name, slug: store.slug }}>
          <LogoSection storeId={store.id} logo={parseLogo(store.settings)} logoOnly={parseLogoOnly(store.settings)} />
          <ContactSection storeId={store.id} initial={contact} />
          <AnalyticsSection storeId={store.id} slug={store.slug} clarityProjectId={parseClarityProjectId(store.settings)} hasApiToken={!!parseClarityApiToken(store.settings)} />
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
