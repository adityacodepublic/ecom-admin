import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { OrderError } from "@/lib/orders/errors";
import { logoSchema, parseLogo, parseLogoOnly, updateSettingsPart } from "@/lib/store-settings";
import { revalidateStoreInfo } from "@/lib/store-revalidate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/** The store's name and logo: shown in the store's header, footer and browser tab. logoOnly: the header shows the logo without the name. */
const brandingPatchSchema = z
  .object({
    name: z.string().trim().min(2, "Use at least 2 characters").max(60).optional(),
    logo: logoSchema.optional(),
    logoOnly: z.boolean().optional(),
  })
  .strict();

const read = async (storeId: string) => {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true, settings: true } });
  if (!store) throw new OrderError("STORE_NOT_FOUND", "Store not found");
  return { name: store.name, logo: parseLogo(store.settings), logoOnly: parseLogoOnly(store.settings), slug: store.slug };
};

/** Owner: the current name and logo. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const { name, logo, logoOnly } = await read(storeId);
    return json({ branding: { name, logo, logoOnly } });
  } catch (error) {
    return errorResponse(error, "BRANDING_GET");
  }
}

/** Owner: change the name, the logo ("" = the default icon) and/or logoOnly. Returns all three. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, brandingPatchSchema);
    if (body.name !== undefined) await prismadb.store.update({ where: { id: storeId }, data: { name: body.name } });
    if (body.logo !== undefined && (await updateSettingsPart(storeId, "logo", () => body.logo)) === null) {
      throw new OrderError("STORE_NOT_FOUND", "Store not found");
    }
    if (body.logoOnly !== undefined) await updateSettingsPart(storeId, "logoOnly", () => body.logoOnly);
    const { name, logo, logoOnly, slug } = await read(storeId);
    revalidateStoreInfo(slug);
    return json({ branding: { name, logo, logoOnly } });
  } catch (error) {
    return errorResponse(error, "BRANDING_PATCH");
  }
}
