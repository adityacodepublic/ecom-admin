import { z } from "zod";

import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { CHROME_HTML_MAX, DEFAULT_FOOTER_HTML, DEFAULT_NAVBAR_HTML, validateChromeHtml } from "@/lib/chrome-templates";
import { OrderError } from "@/lib/orders/errors";
import { readSettings, parseFooterHtml, parseNavbarHtml, updateStoreSettings } from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

const defaults = { navbarHtml: DEFAULT_NAVBAR_HTML, footerHtml: DEFAULT_FOOTER_HTML };

/** One piece of HTML: "" = use the default. The unsafe parts (scripts, event handlers...) are refused with a clear message. */
const chromeHtml = z
  .string()
  .max(CHROME_HTML_MAX, `Too long: use at most ${CHROME_HTML_MAX.toLocaleString("en-US")} characters.`)
  .superRefine((html, ctx) => {
    const problem = validateChromeHtml(html);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** The store's own navbar and footer HTML (shown on every store page). Each is sent in full; "" = the default. */
const chromePatchSchema = z.object({ navbarHtml: chromeHtml, footerHtml: chromeHtml }).strict();

/** Owner: the saved navbar and footer HTML ("" = the default) and the default templates. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const settings = await readSettings(storeId);
    if (settings === null) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    return json({ navbarHtml: parseNavbarHtml(settings), footerHtml: parseFooterHtml(settings), defaults });
  } catch (error) {
    return errorResponse(error, "CHROME_GET");
  }
}

/** Owner: save the navbar and footer HTML. Returns what was saved. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const { navbarHtml, footerHtml } = await readBody(req, chromePatchSchema);
    // One locked write: both change together or not at all.
    const store = await updateStoreSettings(storeId, { navbarHtml: () => navbarHtml, footerHtml: () => footerHtml });
    if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    revalidateStoreInfo(store.slug);
    return json({ navbarHtml: parseNavbarHtml(store.settings), footerHtml: parseFooterHtml(store.settings), defaults });
  } catch (error) {
    return errorResponse(error, "CHROME_PATCH");
  }
}
