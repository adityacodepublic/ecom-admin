import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import {
  clarityApiTokenSchema,
  clarityProjectIdSchema,
  googleSiteVerificationSchema,
  parseClarityApiToken,
  parseClarityProjectId,
  parseGoogleSiteVerification,
  updateStoreSettings,
} from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/**
 * The owner's visitor-analytics settings. Each field is optional: left out = unchanged.
 *   clarityProjectId        the store loads Clarity with it ("" = not connected)
 *   clarityApiToken         the Data Export token that fills the dashboard's visitor numbers ("" = remove). Write-only:
 *                           it is never returned, only whether one is saved.
 *   googleSiteVerification  the Google Search Console HTML-tag token, or the whole pasted <meta> tag ("" = remove).
 *                           The store puts it in a <meta name="google-site-verification"> tag on its pages.
 */
const analyticsPatchSchema = z
  .object({
    clarityProjectId: clarityProjectIdSchema.optional(),
    clarityApiToken: clarityApiTokenSchema.optional(),
    googleSiteVerification: googleSiteVerificationSchema.optional(),
  })
  .strict();

const view = (settings: unknown) => ({
  clarityProjectId: parseClarityProjectId(settings),
  hasApiToken: !!parseClarityApiToken(settings),
  googleSiteVerification: parseGoogleSiteVerification(settings),
});

const read = async (storeId: string) => {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true, settings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  return view(store.settings);
};

/** Owner: the connected Clarity project id ("" = none), whether an API token is saved, and the Search Console token. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    return json({ analytics: await read(storeId) });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_GET");
  }
}

/** Owner: connect / disconnect Clarity, save / remove the API token, and set / remove the Search Console verification. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, analyticsPatchSchema);
    const { clarityProjectId: id, clarityApiToken: token, googleSiteVerification: gsv } = body;
    // One locked write: the project id, the token and the saved visitor numbers change together or not at all.
    let idChanged = false;
    let gsvChanged = false;
    const store = await updateStoreSettings(storeId, {
      ...(id !== undefined && {
        clarityProjectId: (current) => {
          idChanged = id !== parseClarityProjectId({ clarityProjectId: current });
          return id;
        },
      }),
      ...(token !== undefined && { clarityApiToken: () => token }),
      ...(gsv !== undefined && {
        googleSiteVerification: (current) => {
          gsvChanged = gsv !== parseGoogleSiteVerification({ googleSiteVerification: current });
          return gsv;
        },
      }),
      // A different project or token: the saved visitor numbers no longer apply (the next dashboard visit fetches fresh
      // ones). Runs after the id above (parts are written in this order), so idChanged is known here.
      clarityInsights: (current) => (idChanged || token !== undefined ? null : current),
    });
    if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    // The store app caches slug -> store (the Clarity id and the verification token included) under store-<slug>.
    if (idChanged || gsvChanged) revalidateStoreInfo(store.slug);
    return json({ analytics: view(store.settings) });
  } catch (error) {
    return errorResponse(error, "ANALYTICS_PATCH");
  }
}
