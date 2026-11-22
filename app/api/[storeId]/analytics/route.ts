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
  updateSettingsPart,
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
    const before = await read(storeId);
    let changed = false; // a different project or token: the saved visitor numbers no longer apply
    if (body.clarityProjectId !== undefined && body.clarityProjectId !== before.clarityProjectId) {
      const id = body.clarityProjectId;
      if ((await updateSettingsPart(storeId, "clarityProjectId", () => id)) === null) throw new OrderError("STORE_NOT_FOUND", "Store not found");
      revalidateStoreInfo(before.slug); // the store app caches slug -> store (this id included) under store-<slug>
      changed = true;
    }
    if (body.clarityApiToken !== undefined) {
      const token = body.clarityApiToken;
      if ((await updateSettingsPart(storeId, "clarityApiToken", () => token)) === null) throw new OrderError("STORE_NOT_FOUND", "Store not found");
      changed = true;
    }
    if (changed) await updateSettingsPart(storeId, "clarityInsights", () => null); // the next dashboard visit fetches fresh numbers
    const { clarityProjectId, hasApiToken } = await read(storeId);
    return json({ analytics: { clarityProjectId, hasApiToken } });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_PATCH");
  }
}
