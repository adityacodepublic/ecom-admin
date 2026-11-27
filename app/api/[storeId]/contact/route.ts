import prismadb from "@/lib/prismadb";
import { revalidateStoreInfo, revalidateStoreOrderSettings } from "@/lib/store-revalidate";
import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json, readBody } from "@/lib/api/http";
import { contactPatchSchema, getContact, updateContact } from "@/lib/contact";
import { OrderError } from "@/lib/orders/errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ storeId: string }> };

/** Owner: read the full contact details (phone, whatsapp, email, address). */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const contact = await getContact(storeId);
    if (!contact) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    return json({ contact });
  } catch (error) {
    return errorResponse(error, "STORE_CONTACT_GET");
  }
}

/** Owner: change some contact details. Returns the full contact. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { storeId } = await params;
    await requireStoreOwner(storeId);
    const body = await readBody(req, contactPatchSchema);
    const contact = await updateContact(storeId, body);
    if (!contact) throw new OrderError("STORE_NOT_FOUND", "Store not found");
    const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    revalidateStoreOrderSettings(storeId);
    if (store?.slug) revalidateStoreInfo(store.slug);
    return json({ contact });
  } catch (error) {
    return errorResponse(error, "STORE_CONTACT_PATCH");
  }
}
