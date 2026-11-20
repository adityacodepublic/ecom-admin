import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { clarityProjectIdSchema, parseClarityProjectId, updateSettingsPart } from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/** The owner's own Microsoft Clarity project id. The store loads Clarity with it ("" = not connected). */
const analyticsPatchSchema = z.object({ clarityProjectId: clarityProjectIdSchema }).strict();

const read = async (storeId: string) => {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, settings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  return { clarityProjectId: parseClarityProjectId(store.settings), slug: store.slug };
};

/** Owner: the connected Clarity project id ("" = none). */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const { clarityProjectId } = await read(storeId);
    return json({ analytics: { clarityProjectId } });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_GET");
  }
}

/** Owner: connect (a project id) or disconnect ("") Clarity. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, analyticsPatchSchema);
    if ((await updateSettingsPart(storeId, "clarityProjectId", () => body.clarityProjectId)) === null) {
      throw new OrderError("STORE_NOT_FOUND", "Store not found");
    }
    const { clarityProjectId, slug } = await read(storeId);
    revalidateStoreInfo(slug); // the store app caches slug -> store (this id included) under store-<slug>
    return json({ analytics: { clarityProjectId } });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_PATCH");
  }
}
