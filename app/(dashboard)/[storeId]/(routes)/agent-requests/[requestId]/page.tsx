import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { getRequest } from "@/lib/agent/decide";

import { AgentRequestModal } from "./components/agent-request-modal";
import { loadLookups } from "./components/lookups";

const AgentRequestPage = async ({ params }: { params: Promise<{ storeId: string; requestId: string }> }) => {
  const { storeId, requestId } = await params;
  await requireStoreOwnerPage(storeId);

  // Current names of the records the request points to, looked up in THIS store only.
  const request = await getRequest(storeId, requestId);
  const lookups = request ? await loadLookups(storeId, request) : {};

  return <AgentRequestModal storeId={storeId} requestId={requestId} lookups={lookups} />;
};

export default AgentRequestPage;
