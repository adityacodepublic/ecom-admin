import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import {
  clarityApiTokenSchema,
  clarityProjectIdSchema,
  parseClarityApiToken,
  parseClarityProjectId,
  updateStoreSettings,
} from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/**
 * The owner's Microsoft Clarity settings. Each field is optional: left out = unchanged.
 *   clarityProjectId  the store loads Clarity with it ("" = not connected)
 *   clarityApiToken   the Data Export token that fills the dashboard's visitor numbers ("" = remove). Write-only:
 *                     it is never returned, only whether one is saved.
 */
const analyticsPatchSchema = z.object({ clarityProjectId: clarityProjectIdSchema.optional(), clarityApiToken: clarityApiTokenSchema.optional() }).strict();

const read = async (storeId: string) => {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, settings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  return { clarityProjectId: parseClarityProjectId(store.settings), hasApiToken: !!parseClarityApiToken(store.settings), slug: store.slug };
};

/** Owner: the connected Clarity project id ("" = none), and whether an API token is saved. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const { clarityProjectId, hasApiToken } = await read(storeId);
    return json({ analytics: { clarityProjectId, hasApiToken } });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_GET");
  }
}

/** Owner: connect / disconnect Clarity, and save / remove the API token. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, analyticsPatchSchema);
    const { clarityProjectId: id, clarityApiToken: token } = body;
    // One locked write: the project id, the token and the saved visitor numbers change together or not at all.
    let idChanged = false;
    const store = await updateStoreSettings(storeId, {
      ...(id !== undefined && {
        clarityProjectId: (current) => {
          idChanged = id !== parseClarityProjectId({ clarityProjectId: current });
          return id;
        },
      }),
      ...(token !== undefined && { clarityApiToken: () => token }),
      // A different project or token: the saved visitor numbers no longer apply (the next dashboard visit fetches fresh
      // ones). Runs after the id above (parts are written in this order), so idChanged is known here.
      clarityInsights: (current) => (idChanged || token !== undefined ? null : current),
    });
    if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    if (idChanged) revalidateStoreInfo(store.slug); // the store app caches slug -> store (this id included) under store-<slug>
    return json({ analytics: { clarityProjectId: parseClarityProjectId(store.settings), hasApiToken: !!parseClarityApiToken(store.settings) } });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_PATCH");
  }
}
