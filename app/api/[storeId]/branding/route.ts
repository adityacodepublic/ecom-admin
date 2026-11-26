import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { faviconSchema, logoSchema, parseFavicon, parseLogo, parseLogoOnly, updateStoreSettings } from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/** The store's name, logo and favicon: shown in the store's header, footer and browser tab. logoOnly: the header shows the logo without the name. favicon: the browser-tab icon ("" = the tab uses the logo). */
const brandingPatchSchema = z
  .object({
    name: z.string().trim().min(2, "Use at least 2 characters").max(60).optional(),
    logo: logoSchema.optional(),
    logoOnly: z.boolean().optional(),
    favicon: faviconSchema.optional(),
  })
  .strict();

const read = async (storeId: string) => {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true, settings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  return { name: store.name, logo: parseLogo(store.settings), logoOnly: parseLogoOnly(store.settings), favicon: parseFavicon(store.settings), slug: store.slug };
};

/** Owner: the current name, logo and favicon. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const { name, logo, logoOnly, favicon } = await read(storeId);
    return json({ branding: { name, logo, logoOnly, favicon } });
  } catch (error) {
    return errorResponse(error, "BRANDING_GET");
  }
}

/** Owner: change the name, the logo ("" = the default icon), logoOnly and/or the favicon ("" = use the logo). Returns all four. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, brandingPatchSchema);
    // One locked write: the name, the logo, logoOnly and the favicon change together or not at all.
    const { name, logo, logoOnly, favicon } = body;
    const store = await updateStoreSettings(
      storeId,
      { ...(logo !== undefined && { logo: () => logo }), ...(logoOnly !== undefined && { logoOnly: () => logoOnly }), ...(favicon !== undefined && { favicon: () => favicon }) },
      name,
    );
    if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    revalidateStoreInfo(store.slug);
    return json({ branding: { name: store.name, logo: parseLogo(store.settings), logoOnly: parseLogoOnly(store.settings), favicon: parseFavicon(store.settings) } });
  } catch (error) {
    return errorResponse(error, "BRANDING_PATCH");
  }
}
